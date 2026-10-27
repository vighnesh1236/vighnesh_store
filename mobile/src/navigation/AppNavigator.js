import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import {
  AccountScreen, AddressesScreen, AdminScreen, CartScreen, CategoriesScreen,
  CheckoutScreen, HomeScreen, LoginScreen, OrderDetailScreen, OrdersScreen,
  ProductScreen, RegisterScreen, SearchScreen, SplashScreen, WishlistScreen
} from '../screens/Screens';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#f28b20',
        tabBarInactiveTintColor: '#667085',
        tabBarStyle: { height: 62, paddingBottom: 7, paddingTop: 5, borderTopColor: '#e6e8eb' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⌂</Text> }} />
      <Tab.Screen name="Categories" component={CategoriesScreen} options={{ tabBarLabel: 'Categories', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>▦</Text> }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarLabel: 'You', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>♙</Text> }} />
      <Tab.Screen name="Cart" component={CartScreen} options={{ tabBarLabel: 'Cart', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🛒</Text> }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { ready } = useAuth();
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" color="#f28b20" /></View>;
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Store" component={MainTabs} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Product" component={ProductScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="Orders" component={OrdersScreen} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
        <Stack.Screen name="Addresses" component={AddressesScreen} />
        <Stack.Screen name="Wishlist" component={WishlistScreen} />
        <Stack.Screen name="Admin" component={AdminScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
