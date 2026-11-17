import { useColorScheme } from 'nativewind';
import { AppleButton } from '@invertase/react-native-apple-authentication';

/**
 * Apple's own button, as the Sign in with Apple guidelines require: system
 * artwork and wording, at least as prominent as any other sign-in option.
 * Inverts with the theme so it keeps contrast on both card surfaces.
 */
export function AppleSignInButton({
  onPress,
  height = 44,
  cornerRadius = 12,
}: {
  onPress: () => void;
  height?: number;
  cornerRadius?: number;
}) {
  const { colorScheme } = useColorScheme();
  return (
    <AppleButton
      buttonStyle={colorScheme === 'dark' ? AppleButton.Style.WHITE : AppleButton.Style.BLACK}
      buttonType={AppleButton.Type.SIGN_IN}
      cornerRadius={cornerRadius}
      style={{ width: '100%', height }}
      onPress={onPress}
    />
  );
}
