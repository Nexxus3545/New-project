import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text, View } from 'react-native'
import { useAuthStore } from '../hooks/useAuthStore'
import { usePatientExperienceStore } from '../hooks/usePatientExperienceStore'
import { colors } from '../components/theme'
import { LoadingScreen } from '../components/ui'

import OnboardingScreen from '../screens/OnboardingScreen'
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'

import StaffHomeScreen from '../screens/staff/StaffHomeScreen'
import PatientsScreen from '../screens/staff/PatientsScreen'
import PatientDetailScreen from '../screens/staff/PatientDetailScreen'
import AppointmentsScreen from '../screens/staff/AppointmentsScreen'
import VitalsFormScreen from '../screens/staff/VitalsFormScreen'
import DeliveriesScreen from '../screens/staff/DeliveriesScreen'
import InventoryScreen from '../screens/staff/InventoryScreen'
import StaffProfileScreen from '../screens/staff/StaffProfileScreen'

import PatientHomeScreen from '../screens/patient/PatientHomeScreen'
import PatientAppointmentsScreen from '../screens/patient/PatientAppointmentsScreen'
import PatientVitalsScreen from '../screens/patient/PatientVitalsScreen'
import PatientRecordsScreen from '../screens/patient/PatientRecordsScreen'
import PatientEducationScreen from '../screens/patient/PatientEducationScreen'
import PatientProfileScreen from '../screens/patient/PatientProfileScreen'
import PatientPharmacyScreen from '../screens/patient/PatientPharmacyScreen'
import PatientNotificationsScreen from '../screens/patient/PatientNotificationsScreen'
import PatientEmergencyScreen from '../screens/patient/PatientEmergencyScreen'
import PatientReportsScreen from '../screens/patient/PatientReportsScreen'
import PatientDoctorsScreen from '../screens/patient/PatientDoctorsScreen'
import PatientDoctorDetailScreen from '../screens/patient/PatientDoctorDetailScreen'
import PatientMedicineDetailScreen from '../screens/patient/PatientMedicineDetailScreen'
import PatientCheckoutScreen from '../screens/patient/PatientCheckoutScreen'
import PatientCheckoutSuccessScreen from '../screens/patient/PatientCheckoutSuccessScreen'

const RootStack = createNativeStackNavigator()
const PatientStack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const TabIcon = ({ icon, label, focused, patient }) => (
  <View
    style={{
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 58,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 18,
      backgroundColor: focused
        ? (patient ? 'rgba(243,221,226,0.96)' : 'rgba(204,251,241,0.96)')
        : 'transparent',
    }}
  >
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused
          ? (patient ? colors.brand.rose : colors.teal[600])
          : (patient ? 'rgba(201,137,148,0.12)' : 'rgba(15,118,110,0.08)'),
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.4,
          color: focused ? colors.white : (patient ? colors.brand.copper : colors.teal[700]),
        }}
      >
        {icon}
      </Text>
    </View>
    <Text style={{
      fontSize: 10,
      marginTop: 4,
      fontWeight: focused ? '700' : '500',
      color: focused
        ? (patient ? colors.brand.copper : colors.teal[700])
        : colors.gray[400],
    }}>
      {label}
    </Text>
  </View>
)

function StaffTabs() {
  const tabs = [
    { name: 'Home', component: StaffHomeScreen, icon: 'DB', label: 'Dashboard' },
    { name: 'Patients', component: PatientsScreen, icon: 'PT', label: 'Patients' },
    { name: 'Appointments', component: AppointmentsScreen, icon: 'AP', label: 'Schedule' },
    { name: 'Deliveries', component: DeliveriesScreen, icon: 'DL', label: 'Deliveries' },
    { name: 'Inventory', component: InventoryScreen, icon: 'RX', label: 'Inventory' },
  ]

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 76,
          paddingBottom: 8,
          paddingTop: 6,
          marginHorizontal: 12,
          marginBottom: 10,
          borderTopWidth: 0,
          borderRadius: 26,
          backgroundColor: colors.white,
          borderTopColor: colors.gray[200],
          shadowColor: '#6b4450',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 20,
          elevation: 12,
        },
        tabBarShowLabel: false,
        tabBarItemStyle: {
          paddingTop: 2,
          paddingBottom: 2,
        },
      }}
    >
      {tabs.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon={tab.icon} label={tab.label} focused={focused} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  )
}

function PatientTabs() {
  const tabs = [
    { name: 'Home', component: PatientHomeScreen, icon: 'HM', label: 'Home' },
    { name: 'Appointments', component: PatientAppointmentsScreen, icon: 'AP', label: 'Schedule' },
    { name: 'Vitals', component: PatientVitalsScreen, icon: 'VT', label: 'Vitals' },
    { name: 'Records', component: PatientRecordsScreen, icon: 'RC', label: 'Records' },
    { name: 'Education', component: PatientEducationScreen, icon: 'ED', label: 'Tips' },
    { name: 'Profile', component: PatientProfileScreen, icon: 'PF', label: 'Profile' },
  ]

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 76,
          paddingBottom: 8,
          paddingTop: 6,
          marginHorizontal: 12,
          marginBottom: 10,
          borderTopWidth: 0,
          borderRadius: 26,
          backgroundColor: colors.white,
          borderTopColor: colors.rose[100],
          shadowColor: '#6b4450',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 20,
          elevation: 12,
        },
        tabBarShowLabel: false,
        tabBarItemStyle: {
          paddingTop: 2,
          paddingBottom: 2,
        },
      }}
    >
      {tabs.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon={tab.icon} label={tab.label} focused={focused} patient />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  )
}

function PatientNavigator() {
  return (
    <PatientStack.Navigator screenOptions={{ headerShown: false }}>
      <PatientStack.Screen name="PatientTabs" component={PatientTabs} />
      <PatientStack.Screen name="PatientPharmacy" component={PatientPharmacyScreen} />
      <PatientStack.Screen name="PatientReports" component={PatientReportsScreen} />
      <PatientStack.Screen name="PatientAppointments" component={PatientAppointmentsScreen} />
      <PatientStack.Screen name="PatientVitals" component={PatientVitalsScreen} />
      <PatientStack.Screen name="PatientRecords" component={PatientRecordsScreen} />
      <PatientStack.Screen name="PatientEducation" component={PatientEducationScreen} />
      <PatientStack.Screen name="PatientProfile" component={PatientProfileScreen} />
      <PatientStack.Screen name="Doctors" component={PatientDoctorsScreen} />
      <PatientStack.Screen name="DoctorDetail" component={PatientDoctorDetailScreen} />
      <PatientStack.Screen name="PatientNotifications" component={PatientNotificationsScreen} />
      <PatientStack.Screen name="PatientEmergency" component={PatientEmergencyScreen} />
      <PatientStack.Screen name="MedicineDetail" component={PatientMedicineDetailScreen} />
      <PatientStack.Screen name="PharmacyCheckout" component={PatientCheckoutScreen} />
      <PatientStack.Screen name="CheckoutSuccess" component={PatientCheckoutSuccessScreen} />
    </PatientStack.Navigator>
  )
}

export default function RootNavigator() {
  const { user, isInitialized, initialize } = useAuthStore()
  const { hasSeenOnboarding, onboardingLoaded, hydrateOnboarding } = usePatientExperienceStore()

  useEffect(() => {
    initialize()
    hydrateOnboarding()
  }, [initialize, hydrateOnboarding])

  if (!isInitialized || !onboardingLoaded) {
    return <LoadingScreen message="Starting MWOS..." />
  }

  const isPatient = user?.role === 'patient'

  if (!user && !hasSeenOnboarding) {
    return <OnboardingScreen />
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <RootStack.Screen name="Login" component={LoginScreen} />
            <RootStack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : isPatient ? (
          <RootStack.Screen name="PatientNavigator" component={PatientNavigator} />
        ) : (
          <>
            <RootStack.Screen name="StaffTabs" component={StaffTabs} />
            <RootStack.Screen
              name="PatientDetail"
              component={PatientDetailScreen}
              options={{ headerShown: true, title: 'Patient Record', headerTintColor: colors.teal[600] }}
            />
            <RootStack.Screen
              name="VitalsForm"
              component={VitalsFormScreen}
              options={{ headerShown: true, title: 'Record Vitals', headerTintColor: colors.teal[600] }}
            />
            <RootStack.Screen
              name="StaffProfile"
              component={StaffProfileScreen}
              options={{ headerShown: true, title: 'My Profile', headerTintColor: colors.teal[600] }}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  )
}
