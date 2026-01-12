/**
 * Native router implementation using @react-navigation.
 */

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SearchScreen } from '../../search/native/SearchScreen';
import { SeriesScreen } from '../../series/native/SeriesScreen';
import { BookScreen } from '../../book/native/BookScreen';

/**
 * Type-safe route params for navigation.
 */
export type RootStackParamList = {
  Search: { query?: string | undefined; skipAnimation?: boolean | undefined } | undefined;
  Series: { slug: string };
  Book: { isbn: string; slug?: string | undefined };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function Router(): JSX.Element {
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
        <Stack.Screen name="Book" component={BookScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
