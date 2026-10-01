import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useColorScheme } from 'nativewind';
import BottomNav from './BottomNav';
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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/**
 * The 5 primary tabs from components/ios/IOSBottomNav.tsx, in the same
 * order. Settings, Notes, and its editor are off-nav stack screens (reached
 * from Header's Notes/Settings buttons, same as the web app's IOSHeader),
 * pushed above the tab navigator with the platform's native back gesture.
 */
function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Overview" component={OverviewScreen} />
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Plans" component={PlansScreen} />
      <Tab.Screen name="Routine" component={RoutineScreen} />
      <Tab.Screen name="Tracking" component={TrackingScreen} />
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
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '800' },
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
        <Stack.Screen name="Goals" component={GoalsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="GoalDetail" component={GoalDetailScreen} options={{ title: '' }} />
        <Stack.Screen name="NewGoal" component={NewGoalScreen} options={{ title: 'New Goal' }} />
        <Stack.Screen name="NewMilestone" component={NewMilestoneScreen} options={{ title: 'Add Milestone' }} />
        <Stack.Screen name="MilestoneDetail" component={MilestoneDetailScreen} options={{ title: '' }} />
        <Stack.Screen name="AdaptMilestone" component={AdaptMilestoneScreen} options={{ title: 'Adjust Milestone' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
