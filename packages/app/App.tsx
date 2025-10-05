import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

function getWebUrl() {
  const devUrl = 'http://localhost:5173';
  const prodUrl = (Constants.expoConfig?.extra as any)?.WEB_URL as string | undefined;
  if (__DEV__) return devUrl;
  return prodUrl || devUrl; // fallback to dev URL if not configured
}

export default function App() {
  const uri = getWebUrl();
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <WebView
        source={{ uri }}
        style={styles.webview}
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        startInLoadingState
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
});
