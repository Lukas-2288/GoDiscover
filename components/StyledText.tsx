import { Text, TextProps } from './Themed';
import { monoFont } from '../lib/typography';

export function MonoText(props: TextProps) {
  return <Text {...props} style={[props.style, { fontFamily: monoFont }]} />;
}
