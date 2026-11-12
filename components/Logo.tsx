import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';

type LogoProps = {
  size?: number;
  animated?: boolean;
};

export function Logo({ size = 40, animated = true }: LogoProps) {
  const { colors: Colors } = useTheme();
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;
    const bounce = (sv: { value: number }, delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(-size * 0.12, { duration: 350, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 350, easing: Easing.in(Easing.quad) }),
          ),
          -1,
          false,
        ),
      );

    dot1.value = bounce(dot1, 0);
    dot2.value = bounce(dot2, 180);
    dot3.value = bounce(dot3, 360);
    ring.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(dot1);
      cancelAnimation(dot2);
      cancelAnimation(dot3);
      cancelAnimation(ring);
    };
  }, [animated, size]);

  const dot1Style = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const dot2Style = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const dot3Style = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${ring.value}deg` }] }));

  const dotSize = size * 0.22;
  const gap = size * 0.06;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: Colors.primary[300],
          },
          ringStyle,
        ]}
      >
        <View
          style={[
            styles.r1, { width: size * 0.16, height: size * 0.16, borderRadius: size * 0.08, backgroundColor: Colors.primary[500] }]}
        />
        <View
          style={[styles.r2, { width: size * 0.12, height: size * 0.12, borderRadius: size * 0.06, backgroundColor: Colors.accent[400] }]}
        />
      </Animated.View>
      <View style={[styles.dots, { gap }]}>
        <Animated.View style={[styles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: Colors.primary[600] }, dot1Style]} />
        <Animated.View style={[styles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: Colors.primary[400] }, dot2Style]} />
        <Animated.View style={[styles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: Colors.accent[500] }, dot3Style]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  r1: {
    marginTop: -2,
    marginRight: -2,
  },
  r2: {
    position: 'absolute',
    bottom: -2,
    left: -2,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {},
});
