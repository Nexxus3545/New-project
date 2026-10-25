export function bindSessionCache(authStore, queryClient) {
  return authStore.subscribe((state, previous) => {
    if (state.user?.id !== previous.user?.id || state.user?.role !== previous.user?.role) {
      // Clear synchronously before consumers render an unscoped key for the next account.
      queryClient.clear()
    }
  })
}
