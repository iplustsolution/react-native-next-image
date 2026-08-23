import { View, StyleSheet } from 'react-native';
import NextImage from 'react-native-next-image';

export default function App() {
  return (
    <View style={styles.container}>
      <NextImage
        style={styles.image}
        source={{
          uri: 'https://unsplash.it/400/400',
          priority: 'high',
          cache: 'immutable',
        }}
        resizeMode="cover"
        transition="fade"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 200,
    height: 200,
  },
});
