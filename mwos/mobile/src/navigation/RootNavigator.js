import React, { useEffect, useRef } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { AppState, Text, View } from 'react-native'
import { useAuthStore } from '../hooks/useAuthStore'
import { usePatientExperienceStore } from '../hooks/usePatientExperienceStore'
import { colors } from '../components/theme'
import { LoadingScreen } from '../components/ui'
import { MobileIcon } from '../components/Icon'
import SettingsScreen from '../screens/SettingsScreen'
import { useMobileSettings } from '../hooks/useMobileSettings'

import OnboardingScreen from '../screens/OnboardingScreen'
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import CompletePatientProfileScreen from '../screens/CompletePatientProfileScreen'
import { useQueryClient } from '@tanstack/react-query'

import StaffHomeScreen from '../screens/staff/StaffHomeScreen'
import PatientsScreen from '../screens/staff/PatientsScreen'
import PatientDetailScreen from '../screens/staff/PatientDetailScreen'
import AppointmentsScreen from '../screens/staff/AppointmentsScreen'
import VitalsFormScreen from '../screens/staff/VitalsFormScreen'
import DeliveriesScreen from '../screens/staff/DeliveriesScreen'
import InventoryScreen from '../screens/staff/InventoryScreen'
import StaffProfileScreen from '../screens/staff/StaffProfileScreen'
import EmergencyMapScreen from '../screens/staff/EmergencyMapScreen'

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
import PatientMessagesScreen from '../screens/patient/PatientMessagesScreen'
import PatientConversationScreen from '../screens/patient/PatientConversationScreen'
import PatientTelehealthScreen from '../screens/patient/PatientTelehealthScreen'

const RootStack = createNativeStackNavigator()
const PatientStack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const TabIcon = ({ icon, label, focused, patient }) => (
  <View
    style={{
      alignItems: 'center',
      justifyContent: 'center',
      width: 60,
      paddingVertical: 4,
      paddingHorizontal: 2,
      borderRadius: 18,
      backgroundColor: focused
        ? (patient ? colors.rose[50] : colors.teal[50])
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
          : (patient ? colors.rose[50] : colors.teal[50]),
      }}
    >
      <MobileIcon
        name={icon}
        size={20}
        color={focused ? colors.white : (patient ? colors.brand.copper : colors.teal[700])}
      />
    </View>
    <Text style={{
      fontSize: 9,
      marginTop: 4,
      fontWeight: focused ? '700' : '500',
      color: focused
        ? (patient ? colors.brand.copper : colors.teal[700])
        : colors.gray[400],
    }} numberOfLines={1}>
      {label}
    </Text>
  </View>
)

function StaffTabs() {
  const tabs = [
    { name: 'Home', component: StaffHomeScreen, icon: 'view-dashboard-outline', label: 'Dashboard' },
    { name: 'Patients', component: PatientsScreen, icon: 'account-group-outline', label: 'Patients' },
    { name: 'Appointments', component: AppointmentsScreen, icon: 'calendar-check-outline', label: 'Appointments' },
    { name: 'Deliveries', component: DeliveriesScreen, icon: 'baby-carriage', label: 'Delivery' },
    { name: 'Inventory', component: InventoryScreen, icon: 'pill', label: 'Inventory' },
  ]

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 72,
          paddingBottom: 7,
          paddingTop: 5,
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
        tabBarHideOnKeyboard: true,
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
    { name: 'Home', component: PatientHomeScreen, icon: 'view-dashboard-outline', label: 'Home' },
    { name: 'Visits', component: PatientAppointmentsScreen, icon: 'calendar-check-outline', label: 'Visits' },
    { name: 'Telehealth', component: PatientTelehealthScreen, icon: 'video-outline', label: 'Telehealth' },
    { name: 'Messages', component: PatientMessagesScreen, icon: 'message-text-outline', label: 'Messages' },
    { name: 'Profile', component: PatientProfileScreen, icon: 'account-circle-outline', label: 'Profile' },
  ]

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 72,
          paddingBottom: 7,
          paddingTop: 5,
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
        tabBarHideOnKeyboard: true,
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
      <PatientStack.Screen name="PatientMessages" component={PatientMessagesScreen} />
      <PatientStack.Screen name="PatientConversation" component={PatientConversationScreen} />
      <PatientStack.Screen name="PatientTelehealth" component={PatientTelehealthScreen} />
      <PatientStack.Screen name="PatientEmergency" component={PatientEmergencyScreen} />
      <PatientStack.Screen name="MedicineDetail" component={PatientMedicineDetailScreen} />
      <PatientStack.Screen name="PharmacyCheckout" component={PatientCheckoutScreen} />
      <PatientStack.Screen name="CheckoutSuccess" component={PatientCheckoutSuccessScreen} />
    </PatientStack.Navigator>
  )
}

export default function RootNavigator() {
  const queryClient = useQueryClient()
  const {
    user,
    isInitialized,
    initialize,
    biometricEnabled,
    lockForBiometric,
  } = useAuthStore()
  const { hasSeenOnboarding, onboardingLoaded, hydrateOnboarding } = usePatientExperienceStore()
  const backgroundedAt = useRef(null)
  const previousUser = useRef(null)

  useEffect(() => {
    if (previousUser.current !== user?.id) queryClient.clear()
    previousUser.current = user?.id
  }, [user?.id, queryClient])

  useEffect(() => {
    initialize()
    hydrateOnboarding()
    useMobileSettings.getState().hydrate()
  }, [initialize, hydrateOnboarding])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'inactive' || nextAppState === 'background') {
        backgroundedAt.current = Date.now()
        return
      }

      if (nextAppState === 'active' && biometricEnabled && backgroundedAt.current) {
        const elapsed = Date.now() - backgroundedAt.current
        backgroundedAt.current = null

        // A short grace period avoids locking while the user handles a brief
        // system interruption, while protecting a clinic session left open.
        if (elapsed >= 30_000) {
          lockForBiometric()
        }
      }
    })

    return () => subscription.remove()
  }, [biometricEnabled, lockForBiometric])

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
        ) : isPatient && !user.patientId ? (
          <RootStack.Screen name="CompletePatientProfile" component={CompletePatientProfileScreen} />
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
            <RootStack.Screen
              name="EmergencyMap"
              component={EmergencyMapScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
        {user && (!isPatient || user.patientId) ? <RootStack.Screen name="Settings" component={SettingsScreen} /> : null}
      </RootStack.Navigator>
    </NavigationContainer>
  )
}
