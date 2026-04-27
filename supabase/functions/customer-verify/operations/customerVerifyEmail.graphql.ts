// CustomerVerifyEmail — exchanges a magic-link token (from the email Mamamia
// sent via SendInvitationCustomer) for a User record carrying a customer-scope
// JWT in `token`. That JWT is what authorises customer-only mutations like
// SendInvitationCaregiver.
export const CUSTOMER_VERIFY_EMAIL = /* GraphQL */ `
  mutation CustomerVerifyEmail($token: String!) {
    CustomerVerifyEmail(token: $token) {
      id
      email
      token
    }
  }
`;
