import Constants from 'expo-constants'

export function getWebUrl() {
  const devUrl = 'http://localhost:5173'
  const prodUrl = (Constants.expoConfig?.extra as any)?.WEB_URL as string | undefined
  if (__DEV__) return devUrl
  return prodUrl || devUrl
}

