import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';
import { useColorScheme } from 'nativewind';
import OverviewScreen from '../screens/OverviewScreen';
import TodayScreen from '../screens/TodayScreen';
import PlansScreen from '../screens/PlansScreen';
import RoutineScreen from '../screens/RoutineScreen';
import TrackingScreen from '../screens/TrackingScreen';
import SettingsScreen from '../screens/SettingsScreen';
import NotesScreen from '../screens/NotesScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import NewTaskScreen from '../screens/NewTaskScreen';
import NewRoutineScreen from '../screens/NewRoutineScreen';
import PlanDetailScreen from '../screens/PlanDetailScreen';
import NewPlanScreen from '../screens/NewPlanScreen';
import NewTrackerScreen from '../screens/NewTrackerScreen';
import GoalsScreen from '../screens/GoalsScreen';
import GoalDetailScreen from '../screens/GoalDetailScreen';
import NewGoalScreen from '../screens/NewGoalScreen';
import NewMilestoneScreen from '../screens/NewMilestoneScreen';
import MilestoneDetailScreen from '../screens/MilestoneDetailScreen';
import AdaptMilestoneScreen from '../screens/AdaptMilestoneScreen';
import { colors } from '../theme/colors';

const Tab = createNativeBottomTabNavigator();
const Stack = createNativeStackNavigator();

/**
 * Each tab hosts its own native stack so its screen gets a real UINavigationBar
 * (large title, Liquid Glass bar buttons on iOS 26). Screen.tsx fills in the
 * title and buttons via setOptions; navigating to Notes/Settings/New* bubbles
 * up to the root stack below.
 */
function tabStack(name: string, Component: ComponentType) {
  const TabStack = createNativeStackNavigator();
  return function TabStackScreen() {
    const { colorScheme } = useColorScheme();
    const c = colors[colorScheme ?? 'light'];
    return (
      <TabStack.Navigator
        screenOptions={{
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerShadowVisible: false,
          headerTintColor: c.text,
          contentStyle: { backgroundColor: c.surface },
        }}
      >
        <TabStack.Screen name={name} component={Component} />
      </TabStack.Navigator>
    );
  };
}

const OverviewTab = tabStack('Overview', OverviewScreen);
const TodayTab = tabStack('Today', TodayScreen);
const PlansTab = tabStack('Plans', PlansScreen);
const RoutineTab = tabStack('Routine', RoutineScreen);
const TrackingTab = tabStack('Tracking', TrackingScreen);

/**
 * The 5 primary tabs from components/ios/IOSBottomNav.tsx, in the same
 * order, rendered by UITabBarController (system tab bar — Liquid Glass on
 * iOS 26). Settings, Notes, and its editor are off-nav stack screens pushed
 * above the tab navigator with the platform's native back gesture.
 */
function Tabs() {
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: c.momentumGreen,
        tabBarMinimizeBehavior: 'onScrollDown',
      }}
    >
      <Tab.Screen
        name="OverviewTab"
        component={OverviewTab}
        options={{ title: 'Overview', tabBarIcon: { type: 'image', source: require('../assets/nav-icons/tab-overview.png') } }}
      />
      <Tab.Screen
        name="TodayTab"
        component={TodayTab}
        options={{ title: 'Today', tabBarIcon: { type: 'image', source: require('../assets/nav-icons/tab-today.png') } }}
      />
      <Tab.Screen
        name="PlansTab"
        component={PlansTab}
        options={{ title: 'Plans', tabBarIcon: { type: 'image', source: require('../assets/nav-icons/tab-plans.png') } }}
      />
      <Tab.Screen
        name="RoutineTab"
        component={RoutineTab}
        options={{ title: 'Routine', tabBarIcon: { type: 'image', source: require('../assets/nav-icons/tab-routine.png') } }}
      />
      <Tab.Screen
        name="TrackingTab"
        component={TrackingTab}
        options={{ title: 'Track', tabBarIcon: { type: 'image', source: require('../assets/nav-icons/tab-tracking.png') } }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const navTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerTintColor: c.text,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: c.surface },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Notes" component={NotesScreen} options={{ title: 'Notes' }} />
        <Stack.Screen
          name="NoteEditor"
          component={NoteEditorScreen}
          options={{ title: '' }}
        />
        <Stack.Screen name="NewTask" component={NewTaskScreen} options={{ title: 'New Task' }} />
        <Stack.Screen name="NewRoutine" component={NewRoutineScreen} options={{ title: 'New Routine' }} />
        <Stack.Screen name="PlanDetail" component={PlanDetailScreen} options={{ title: '' }} />
        <Stack.Screen name="NewPlan" component={NewPlanScreen} options={{ title: 'New Plan' }} />
        <Stack.Screen name="NewTracker" component={NewTrackerScreen} options={{ title: 'New Tracker' }} />
        <Stack.Screen name="Goals" component={GoalsScreen} options={{ headerLargeTitle: true }} />
        <Stack.Screen name="GoalDetail" component={GoalDetailScreen} options={{ title: '' }} />
        <Stack.Screen name="NewGoal" component={NewGoalScreen} options={{ title: 'New Goal' }} />
        <Stack.Screen name="NewMilestone" component={NewMilestoneScreen} options={{ title: 'Add Milestone' }} />
        <Stack.Screen name="MilestoneDetail" component={MilestoneDetailScreen} options={{ title: '' }} />
        <Stack.Screen name="AdaptMilestone" component={AdaptMilestoneScreen} options={{ title: 'Adjust Milestone' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
