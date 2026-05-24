import { create } from 'zustand'

const CART_STORAGE_KEY = 'patient-pharmacy-cart'

const readStoredCart = () => {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

const persistCart = (cart) => {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
}

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
  cart: readStoredCart(),

  addToCart: (medicine) => set((state) => {
    const cart = upsertCartItem(state.cart, medicine)
    persistCart(cart)
    return { cart }
  }),

  updateQuantity: (medicineId, quantity) => set((state) => {
    const cart = state.cart.map((item) => (
      item.id === medicineId
        ? { ...item, quantity: Math.max(1, Math.min(99, quantity)) }
        : item
    ))
    persistCart(cart)
    return { cart }
  }),

  removeFromCart: (medicineId) => set((state) => {
    const cart = state.cart.filter((item) => item.id !== medicineId)
    persistCart(cart)
    return { cart }
  }),

  clearCart: () => {
    persistCart([])
    set({ cart: [] })
  },
}))
