/**
 * Native router implementation using @react-navigation.
 */

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import '../../store/stores'; // Register all store initializers
import { useStoreInit } from '../../store/useStoreInit';
import { HomeScreen } from '../../search/native/HomeScreen';
import { SearchScreen } from '../../search/native/SearchScreen';
import { SeriesScreen } from '../../series/native/SeriesScreen';
import { VolumeScreen } from '../../book/native/VolumeScreen';
import { AccountScreen } from '../../account-detail/native/AccountScreen';

/**
 * Type-safe route params for navigation.
 */
export type RootStackParamList = {
  Home: undefined;
  Search: { query: string; skipAnimation?: boolean | undefined };
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
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="Search"
          component={SearchScreen}
          options={{
            // No animation from Home - feels like same screen transforming
            animation: 'none',
          }}
        />
        <Stack.Screen name="Series" component={SeriesScreen} />
        <Stack.Screen name="Volume" component={VolumeScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
