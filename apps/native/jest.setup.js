// Official mock, per @react-native-async-storage/async-storage's own docs
// (its native module doesn't exist outside a real app runtime, so importing
// it under Jest throws without this): https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
