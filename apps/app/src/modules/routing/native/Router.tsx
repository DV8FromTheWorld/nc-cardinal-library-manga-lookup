/**
 * Native router implementation using @react-navigation.
 */

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import '../../store/stores'; // Register all store initializers
import { useStoreInit } from '../../store/useStoreInit';
import { SearchScreen } from '../../search/native/SearchScreen';
import { SeriesScreen } from '../../series/native/SeriesScreen';
import { VolumeScreen } from '../../book/native/VolumeScreen';
import { AccountScreen } from '../../account-detail/native/AccountScreen';

/**
 * Type-safe route params for navigation.
 */
export type RootStackParamList = {
  Search: { query?: string | undefined; skipAnimation?: boolean | undefined } | undefined;
  Series: { id: string };
  Volume: { id: string };
  Account: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function Router(): JSX.Element {
  // Initialize all registered stores on app start
  useStoreInit();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Search"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="Search"
          component={SearchScreen}
          options={({ route }) => ({
            // Disable slide animation when navigating between search screens
            animation: route.params?.skipAnimation ? 'none' : 'slide_from_right',
          })}
        />
        <Stack.Screen name="Series" component={SeriesScreen} />
        <Stack.Screen name="Volume" component={VolumeScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
