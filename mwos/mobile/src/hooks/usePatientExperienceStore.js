import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

const ONBOARDING_KEY = 'mwos-mobile:onboarding-complete'

const upsertCartItem = (cart, medicine) => {
  const existing = cart.find((item) => item.id === medicine.id)
  if (!existing) {
    return [...cart, { ...medicine, quantity: 1 }]
  }

  return cart.map((item) => (
    item.id === medicine.id
      ? { ...item, quantity: Math.min(99, (item.quantity || 1) + 1) }
      : item
  ))
}

export const usePatientExperienceStore = create((set) => ({
  hasSeenOnboarding: false,
  onboardingLoaded: false,
  cart: [],

  hydrateOnboarding: async () => {
    try {
      const stored = await AsyncStorage.getItem(ONBOARDING_KEY)
      set({
        hasSeenOnboarding: stored === 'true',
        onboardingLoaded: true,
      })
    } catch {
      set({ onboardingLoaded: true })
    }
  },

  completeOnboarding: async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true')
    } catch {}

    set({
      hasSeenOnboarding: true,
      onboardingLoaded: true,
    })
  },

  addToCart: (medicine) => set((state) => ({
    cart: upsertCartItem(state.cart, medicine),
  })),

  updateQuantity: (medicineId, quantity) => set((state) => ({
    cart: state.cart
      .map((item) => (
        item.id === medicineId
          ? { ...item, quantity: Math.max(1, Math.min(99, quantity)) }
          : item
      )),
  })),

  removeFromCart: (medicineId) => set((state) => ({
    cart: state.cart.filter((item) => item.id !== medicineId),
  })),

  clearCart: () => set({ cart: [] }),
}))
