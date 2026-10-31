// Official mock, per @react-native-async-storage/async-storage's own docs
// (its native module doesn't exist outside a real app runtime, so importing
// it under Jest throws without this): https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The liquid-glass views are native components that don't exist under Jest;
// render them as plain Views, as the library itself does off iOS.
jest.mock('@callstack/liquid-glass', () => {
  const { View } = require('react-native');
  return { LiquidGlassView: View, LiquidGlassContainerView: View, isLiquidGlassSupported: false };
});

// TrueSheet (the iOS bottom sheet) is a native component; render its content
// inline with no-op present/dismiss. It returns the children as they are, as
// a createElement here would be rewritten by NativeWind's Babel plugin into a
// reference Jest's mock factories may not make.
jest.mock('@lodev09/react-native-true-sheet', () => {
  const mockReact = require('react');
  const TrueSheet = mockReact.forwardRef(({ children }, ref) => {
    mockReact.useImperativeHandle(ref, () => ({ present: async () => {}, dismiss: async () => {}, resize: async () => {} }));
    return children ?? null;
  });
  return { TrueSheet };
});
