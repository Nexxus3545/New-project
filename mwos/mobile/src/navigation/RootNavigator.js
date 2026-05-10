import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { useAuthStore } from '../hooks/useAuthStore';
import { colors } from '../components/theme';
import { LoadingScreen } from '../components/ui';

// Auth screens
import LoginScreen from '../screens/LoginScreen';

// Staff screens
import StaffHomeScreen from '../screens/staff/StaffHomeScreen';
import PatientsScreen from '../screens/staff/PatientsScreen';
import PatientDetailScreen from '../screens/staff/PatientDetailScreen';
import AppointmentsScreen from '../screens/staff/AppointmentsScreen';
import VitalsFormScreen from '../screens/staff/VitalsFormScreen';
import DeliveriesScreen from '../screens/staff/DeliveriesScreen';
import InventoryScreen from '../screens/staff/InventoryScreen';
import StaffProfileScreen from '../screens/staff/StaffProfileScreen';

// Patient screens
import PatientHomeScreen from '../screens/patient/PatientHomeScreen';
import PatientAppointmentsScreen from '../screens/patient/PatientAppointmentsScreen';
import PatientVitalsScreen from '../screens/patient/PatientVitalsScreen';
import PatientRecordsScreen from '../screens/patient/PatientRecordsScreen';
import PatientEducationScreen from '../screens/patient/PatientEducationScreen';
import PatientProfileScreen from '../screens/patient/PatientProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabIcon = ({ icon, label, focused, patient }) => (
  <View style={{ alignItems: 'center', paddingTop: 4 }}>
    <Text style={{ fontSize: 20 }}>{icon}</Text>
    <Text style={{
      fontSize: 10, marginTop: 2, fontWeight: focused ? '600' : '400',
      color: focused
        ? (patient ? colors.rose[600] : colors.teal[600])
        : colors.gray[400],
    }}>{label}</Text>
  </View>
);

// ── Staff Tab Navigator ───────────────────────────────────────
function StaffTabs() {
  const tabs = [
    { name: 'Home', component: StaffHomeScreen, icon: '📊', label: 'Dashboard' },
    { name: 'Patients', component: PatientsScreen, icon: '👩‍⚕️', label: 'Patients' },
    { name: 'Appointments', component: AppointmentsScreen, icon: '📅', label: 'Schedule' },
    { name: 'Deliveries', component: DeliveriesScreen, icon: '🏥', label: 'Deliveries' },
    { name: 'Inventory', component: InventoryScreen, icon: '📦', label: 'Inventory' },
  ];

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 70, paddingBottom: 8, paddingTop: 4,
          backgroundColor: colors.white, borderTopColor: colors.gray[200],
        },
        tabBarShowLabel: false,
      }}
    >
      {tabs.map((t) => (
        <Tab.Screen
          key={t.name}
          name={t.name}
          component={t.component}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon={t.icon} label={t.label} focused={focused} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

// ── Patient Tab Navigator ─────────────────────────────────────
function PatientTabs() {
  const tabs = [
    { name: 'PHome', component: PatientHomeScreen, icon: '🏠', label: 'Home' },
    { name: 'PAppts', component: PatientAppointmentsScreen, icon: '📅', label: 'Schedule' },
    { name: 'PVitals', component: PatientVitalsScreen, icon: '💓', label: 'Vitals' },
    { name: 'PRecords', component: PatientRecordsScreen, icon: '📋', label: 'Records' },
    { name: 'PEducation', component: PatientEducationScreen, icon: '📚', label: 'Tips' },
    { name: 'PProfile', component: PatientProfileScreen, icon: '👤', label: 'Profile' },
  ];

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 70, paddingBottom: 8, paddingTop: 4,
          backgroundColor: colors.white, borderTopColor: colors.rose[100],
        },
        tabBarShowLabel: false,
      }}
    >
      {tabs.map((t) => (
        <Tab.Screen
          key={t.name}
          name={t.name}
          component={t.component}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon={t.icon} label={t.label} focused={focused} patient />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

// ── Root Navigator ────────────────────────────────────────────
export default function RootNavigator() {
  const { user, isInitialized, initialize } = useAuthStore();

  useEffect(() => { initialize(); }, []);

  if (!isInitialized) return <LoadingScreen message="Starting MWOS..." />;

  const isPatient = user?.role === 'patient';
  const isStaff = ['admin', 'doctor', 'midwife', 'nurse'].includes(user?.role);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : isPatient ? (
          <>
            <Stack.Screen name="PatientTabs" component={PatientTabs} />
          </>
        ) : (
          <>
            <Stack.Screen name="StaffTabs" component={StaffTabs} />
            <Stack.Screen
              name="PatientDetail"
              component={PatientDetailScreen}
              options={{ headerShown: true, title: 'Patient Record', headerTintColor: colors.teal[600] }}
            />
            <Stack.Screen
              name="VitalsForm"
              component={VitalsFormScreen}
              options={{ headerShown: true, title: 'Record Vitals', headerTintColor: colors.teal[600] }}
            />
            <Stack.Screen
              name="StaffProfile"
              component={StaffProfileScreen}
              options={{ headerShown: true, title: 'My Profile', headerTintColor: colors.teal[600] }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
