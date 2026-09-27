import { Stack } from 'aws-cdk-lib'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources'
import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource'

/**
 * FDAS Monitoring - Gen 2 backend, architecture "A1": the browser
 * subscribes to AWS IoT Core directly over MQTT, as a guest (read-only).
 * See docs/mqtt-contract.md for the wire contract and the step 4 plan for
 * the full architecture writeup.
 *
 * There is no `data` resource here on purpose: this app talks to AWS IoT
 * Core directly (via @aws-amplify/pubsub in the frontend), not through an
 * AppSync API, so there is nothing for Amplify Data to generate.
 */
const backend = defineBackend({
  auth,
})

const unauthRole = backend.auth.resources.unauthenticatedUserIamRole
const { region, account } = Stack.of(unauthRole)

/**
 * Least-privilege AWS IoT policy for the GUEST (unauthenticated) role
 * ONLY - the authenticated role gets no IoT permissions at all in this
 * step (A1 is guest-only; a signed-in tier is a later step, "A2").
 *
 * `addToPrincipalPolicy` attaches each statement below to the role's one
 * auto-created "default policy" - so despite being three separate calls,
 * this synthesizes as ONE IAM policy resource with three statements (one
 * per action, because Connect/Subscribe/Receive each need a different ARN
 * resource type and can't share one statement's resource list).
 *
 * Deliberately NOT granted, anywhere: iot:Publish. This is a read-only
 * annunciator - "publish only from the device" is a DEVICE-side rule (D4
 * in docs/mqtt-contract.md), and the browser gets none of that capability.
 */

// --- iot:Connect ------------------------------------------------------
// Every AWS IoT client ID must be unique per *connection* - AWS IoT drops
// whichever client was already using a given client ID the instant a
// second one connects with that same ID. Two browser tabs sharing one
// guest identity would otherwise fight over a single client ID and keep
// kicking each other offline. So the client ID this app actually connects
// with (see src/data/liveDeviceSource.ts) is `${identityId}-${random}`,
// and the policy below locks each guest to ONLY client IDs starting with
// their own identity ID, via the "-*" suffix.
//
// `${cognito-identity.amazonaws.com:sub}` is an IAM POLICY VARIABLE, not a
// JavaScript/TypeScript template expression - it has to reach the
// synthesized IAM policy JSON completely untouched. A plain `${...}`
// inside a TS template literal would try to evaluate it as a JS
// expression (and fail: `cognito-identity.amazonaws.com:sub` isn't a
// variable in scope). Escaping the `$` as `\$` tells the template literal
// "treat this literally, don't substitute" - so the source text
// `\${cognito-identity.amazonaws.com:sub}` produces the literal
// characters `${cognito-identity.amazonaws.com:sub}` in the resulting
// string, which is exactly what IAM needs to see.
const guestClientArn = `arn:aws:iot:${region}:${account}:client/\${cognito-identity.amazonaws.com:sub}-*`

unauthRole.addToPrincipalPolicy(
  new PolicyStatement({
    sid: 'FdasGuestIotConnect',
    actions: ['iot:Connect'],
    resources: [guestClientArn],
  }),
)

// --- iot:Subscribe ------------------------------------------------------
// Scoped to the two topic SHAPES the contract defines (docs/mqtt-
// contract.md §3), across any device ID - there's one device today
// (fdas-iot-ane1-input-01), but this doesn't need editing when a second
// one joins. `topicfilter/` is the IoT ARN resource type for the
// *subscribe request* itself, distinct from the `topic/` ARNs below, which
// govern each individual message actually being delivered.
//
// "*" and NOT the MQTT wildcard "+": in AWS IoT policies, "+" and "#" are
// LITERAL characters. `topicfilter/fdas/+/state` would only allow
// subscribing to the literal filter text "fdas/+/state"; the app subscribes
// to the concrete topic "fdas/fdas-iot-ane1-input-01/state", which that
// would DENY - and AWS IoT disconnects a client on any denied subscribe.
// (That exact mistake shipped in the first deploy: the page looped on
// "Socket closed".) "*" is the IAM-style wildcard that actually matches.
unauthRole.addToPrincipalPolicy(
  new PolicyStatement({
    sid: 'FdasGuestIotSubscribe',
    actions: ['iot:Subscribe'],
    resources: [
      `arn:aws:iot:${region}:${account}:topicfilter/fdas/*/state`,
      `arn:aws:iot:${region}:${account}:topicfilter/fdas/*/status`,
    ],
  }),
)

// --- iot:Receive ------------------------------------------------------
// `topic/` ARNs use "*" rather than "+": unlike a subscribe topic FILTER,
// iot:Receive is authorized per actual message topic, and IoT resource
// ARNs for a concrete topic use "*" (not "+") as their wildcard segment.
unauthRole.addToPrincipalPolicy(
  new PolicyStatement({
    sid: 'FdasGuestIotReceive',
    actions: ['iot:Receive'],
    resources: [
      `arn:aws:iot:${region}:${account}:topic/fdas/*/state`,
      `arn:aws:iot:${region}:${account}:topic/fdas/*/status`,
    ],
  }),
)

/**
 * Resolve this account's AWS IoT Data-ATS endpoint at DEPLOY time, so it
 * never has to be typed into (or leaked from) this repo. `DescribeEndpoint`
 * has no resource-level permissions in IAM - AWS IoT does not support
 * scoping this call to a specific ARN - so "*" is the correct,
 * least-privilege-as-possible resource for it: we scope the ACTION
 * instead. The custom resource's Lambda can call exactly one read-only
 * IoT API and nothing else.
 */
const iotEndpointStack = backend.createStack('FdasIotEndpointStack')

// One call definition reused for both onCreate and onUpdate, so a
// redeploy re-resolves the endpoint too (harmless - it's the same fixed
// physicalResourceId either way, so this never triggers a resource
// replacement, just a fresh read).
const describeIotEndpoint = {
  // `service`/`action` here are the AWS SDK v3 package/command names.
  // AwsCustomResource's `awsSdkToIamAction` helper (verified in the
  // installed aws-cdk-lib's helpers-internal/sdk-info.js) normalizes this
  // to the IAM action `iot:DescribeEndpoint` automatically - it strips
  // the `@aws-sdk/client-` prefix and the trailing `Command` suffix, so
  // the granted permission is the plain, correct IAM action name, not a
  // literal (and non-existent) "iot:DescribeEndpointCommand".
  service: '@aws-sdk/client-iot',
  action: 'DescribeEndpointCommand',
  parameters: { endpointType: 'iot:Data-ATS' },
  physicalResourceId: PhysicalResourceId.of('FdasIotDataEndpoint'),
}

const iotEndpoint = new AwsCustomResource(iotEndpointStack, 'FdasIotDataEndpoint', {
  onCreate: describeIotEndpoint,
  onUpdate: describeIotEndpoint,
  policy: AwsCustomResourcePolicy.fromSdkCalls({
    resources: AwsCustomResourcePolicy.ANY_RESOURCE,
  }),
  // The AWS SDK already bundled with the Lambda runtime has full IoT
  // support - skip the ~60s "install the latest AWS SDK from npm" step
  // this construct otherwise defaults to for a plain describeEndpoint call.
  installLatestAwsSdk: false,
})

/**
 * Exposes the endpoint (and region) to the frontend via
 * amplify_outputs.json's `custom.iot` - read directly in
 * src/data/liveDeviceSource.ts. This is the ONLY place the endpoint
 * address exists outside AWS itself; it is never hardcoded anywhere in
 * this repo.
 */
backend.addOutput({
  custom: {
    iot: {
      endpoint: iotEndpoint.getResponseField('endpointAddress'),
      region,
    },
  },
})
