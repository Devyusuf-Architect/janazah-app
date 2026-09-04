// Expo native modules, for the design harness only. See stubs/firebase.js.

const noop = () => {};
const resolved = () => Promise.resolve(undefined);

// expo-constants
export const expoConfig = { extra: {} };
export default { expoConfig };

// expo-location
export const PermissionStatus = { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' };
export const Accuracy = { Balanced: 3 };
export const getForegroundPermissionsAsync = async () => ({ status: 'undetermined', canAskAgain: true });
export const requestForegroundPermissionsAsync = getForegroundPermissionsAsync;
export const getCurrentPositionAsync = async () => ({ coords: { latitude: 43.65, longitude: -79.38 } });

// expo-secure-store
export const getItemAsync = async () => null;
export const setItemAsync = resolved;
export const deleteItemAsync = resolved;

// expo-notifications
export const AndroidImportance = { HIGH: 4 };
export const AndroidNotificationVisibility = { PUBLIC: 1 };
export const SchedulableTriggerInputTypes = { DATE: 'date' };
export const setNotificationChannelAsync = resolved;
export const scheduleNotificationAsync = resolved;
export const cancelScheduledNotificationAsync = resolved;
export const getAllScheduledNotificationsAsync = async () => [];
export const addNotificationResponseReceivedListener = () => ({ remove: noop });

// expo-router
export const router = { push: noop, back: noop, replace: noop, canGoBack: () => false };
export const Stack = () => null;
export const Tabs = () => null;
export const useFocusEffect = noop;
export const useLocalSearchParams = () => ({});

// expo-status-bar
export const StatusBar = () => null;
export const setStatusBarStyle = noop;
