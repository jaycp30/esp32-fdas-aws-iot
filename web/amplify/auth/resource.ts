import { defineAuth } from '@aws-amplify/backend';

/**
 * Auth backend for FDAS Monitoring - architecture "A1" (see docs/mqtt-
 * contract.md and the step 4 plan).
 *
 * Only email login is configured. There is no sign-in UI yet - that's a
 * later step ("A2"). What actually matters here, for THIS step, is what
 * defineAuth creates alongside the user pool: a Cognito Identity Pool with
 * an unauthenticated ("guest") IAM role.
 *
 * Amplify Gen 2 turns guest access ON by default - verified against the
 * installed @aws-amplify/auth-construct's compiled source
 * (defaults.js: DEFAULTS.ALLOW_UNAUTHENTICATED_IDENTITIES = true). Nothing
 * below needs to (or can, via this API) explicitly enable it; this comment
 * exists so that default isn't mistaken for an oversight. Every visitor to
 * the web app gets guest credentials automatically via fetchAuthSession()
 * with no sign-in step, which is all the read-only AWS IoT subscription in
 * src/data/liveDeviceSource.ts needs.
 *
 * The IAM policy that actually grants (and strictly limits) what a guest
 * can do on AWS IoT is NOT here - see backend.ts, which attaches a
 * least-privilege policy directly to
 * backend.auth.resources.unauthenticatedUserIamRole.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
