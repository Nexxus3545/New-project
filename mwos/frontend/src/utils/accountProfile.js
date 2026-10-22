export async function updateAccountProfile(api, changes) {
  const { data } = await api.get('/auth/me')
  const current = data.data
  return api.patch('/auth/profile', {
    firstName: current.firstName,
    lastName: current.lastName,
    email: current.email,
    phone: current.phone || '',
    avatarUrl: current.avatarUrl || '',
    ...changes,
  }).then((response) => response.data.data)
}
