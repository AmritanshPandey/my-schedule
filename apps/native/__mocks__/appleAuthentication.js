// Jest stand-in for @invertase/react-native-apple-authentication, whose native
// module doesn't exist under Jest. Reports "unsupported", so the Apple button
// stays hidden and nothing reaches the real sign-in sheet.
const appleAuth = {
  isSupported: false,
  isSignUpButtonSupported: false,
  Operation: { LOGIN: 1, REFRESH: 2, LOGOUT: 3, IMPLICIT: 0 },
  Scope: { EMAIL: 0, FULL_NAME: 1 },
  Error: { UNKNOWN: '1000', CANCELED: '1001', INVALID_RESPONSE: '1002', NOT_HANDLED: '1003', FAILED: '1004' },
  performRequest: jest.fn(() => Promise.reject(new Error('Sign in with Apple is not available in tests'))),
};
const AppleButton = () => null;
AppleButton.Style = { WHITE: 'White', WHITE_OUTLINE: 'WhiteOutline', BLACK: 'Black' };
AppleButton.Type = { SIGN_IN: 'SignIn', CONTINUE: 'Continue', SIGN_UP: 'SignUp' };
module.exports = { appleAuth, AppleButton };
