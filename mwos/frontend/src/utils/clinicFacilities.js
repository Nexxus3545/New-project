// Room names describe the supplied clinic photographs, not live occupancy or service availability.
export const clinicFacilities = {
  reception: {
    src: '/clinic/maternal-reception.jpg', label: 'Reception', title: 'A familiar welcome',
    description: 'The clinic reception and information area, with a desk and seating for arriving visitors.',
    alt: 'TMC Copino reception with an information desk and visitor seating',
  },
  consultation: {
    src: '/clinic/maternal-consultation-room.jpg', label: 'Consultation', title: 'Consultation & examination room',
    description: 'A view of the consultation and examination room, with an examination couch, lamp, sink, and supplies.',
    alt: 'Clinic examination room with an examination couch, lamp, and sink',
  },
  birthing: {
    src: '/clinic/maternal-birthing-room.jpg', label: 'Birthing room', title: 'Birthing & delivery room',
    description: 'The birthing room, showing a delivery table, maternal bed, and newborn bassinet.',
    alt: 'Clinic birthing room with a delivery table, maternal bed, and newborn bassinet',
  },
  recovery: {
    src: '/clinic/maternal-recovery-room.jpg', label: 'Recovery', title: 'Shared ward & recovery area',
    description: 'A photograph of the shared ward with two patient beds and IV stands.',
    alt: 'Shared clinic ward with two patient beds and IV stands',
  },
  ward: {
    src: '/clinic/maternal-ward-room.jpg', label: 'Ward room', title: 'A closer look at the ward',
    description: 'Another ward view, with one patient bed visible and a door marked Ward Room 2 CR.',
    alt: 'Clinic ward with one visible patient bed beside a window and a Ward Room 2 CR door',
  },
}

export const clinicTourFacilities = ['reception', 'consultation', 'birthing', 'recovery', 'ward'].map((key) => clinicFacilities[key])

export const getDeliveryFacility = (pathname) => clinicFacilities[
  ['/postnatal-care', '/postnatal-monitoring'].includes(pathname) ? 'ward' : 'birthing'
]
