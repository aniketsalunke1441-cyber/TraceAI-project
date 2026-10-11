// =====================================================================
//  DEMO DATA (photos: public/demo-photos/*.jpg — also uploaded by scripts/seed-demo-data.mjs) — used only when Supabase is NOT configured.
//  Every record below is fictional sample data for demonstration.
// =====================================================================
import { daysAgoISO } from './utils.js'

const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString()

// Shown on the login page so evaluators can sign in. Only a salted hash is stored.
export const DEMO_PASSWORD = 'demo1234'

// passwordHash = hashPassword('demo1234', salt) — see src/lib/password.js
export const DEMO_USERS = [
  { id: 'demo-user-1', name: 'Demo Student', email: 'demo@findback.app', salt: '5f1c0a9e3b7d42c8a1e6f0d3b2c4a907', passwordHash: '183cb1ed1188056981a29a3e4ca1c2489bd1ddc03b9e4973b21e4515b2d09fae' },
  { id: 'demo-user-2', name: 'Priya Sharma', email: 'priya@findback.app', salt: 'a83e6b1d9c0f4e27b5d8a2c1f3e09b46', passwordHash: '67000130638a57bdb4915ec01ab05834ae2da1732d914e8be4795b31c0eb83da' },
  { id: 'demo-user-3', name: 'Arjun Mehta', email: 'arjun@findback.app', salt: '0c7d2e9f4a1b6c3d8e5f0a2b7c4d9e16', passwordHash: '46921bc326083ac40ffe7df2e838fa19d6feece75677b92f0d235e8ac804b987' },
  { id: 'demo-user-4', name: 'Neha Patel', email: 'neha@findback.app', salt: 'e4b9c2a7d0f3168b5c9e2a4d7f0b3c85', passwordHash: '5ee9bfafd9a157d27f2c1b620614ef10942ad3c4cc029113732da3185c9c76ec' },
]

const user = (n) => DEMO_USERS[n - 1]

function item(id, type, owner, fields) {
  return {
    id,
    type,
    user_id: user(owner).id,
    reporter_name: user(owner).name,
    status: 'open',
    image_url: '',
    brand: '',
    ...fields,
  }
}

export function buildDemoItems() {
  return [
    // ---------------- LOST reports ----------------
    item('demo-item-1', 'lost', 1, {
      image_url: '/demo-photos/phone.jpg',
      title: 'Black iPhone 13 with blue silicone case',
      description:
        'Lost my black iPhone 13 in a blue silicone case. Lock screen wallpaper is a mountain photo. Small crack at the bottom left corner.',
      category: 'Electronics',
      color: 'Black',
      brand: 'Apple',
      location: 'Central Library, 2nd floor reading area',
      date: daysAgoISO(3),
      created_at: hoursAgo(70),
    }),
    item('demo-item-2', 'lost', 3, {
      image_url: '/demo-photos/wallet.jpg',
      title: 'Brown leather wallet',
      description: 'Brown leather bi-fold wallet with my college ID, a metro card and some cash. Initials "AM" on the inside.',
      category: 'Wallets & Purses',
      color: 'Brown',
      brand: 'Woodland',
      location: 'Main canteen',
      date: daysAgoISO(5),
      created_at: hoursAgo(118),
    }),
    item('demo-item-3', 'lost', 4, {
      image_url: '/demo-photos/backpack.jpg',
      title: 'Blue Jansport backpack',
      description: 'Blue backpack with two notebooks, a pencil pouch and a black umbrella. Has a small keychain of a panda.',
      category: 'Bags',
      color: 'Blue',
      brand: 'Jansport',
      location: 'Bus stop near main gate',
      date: daysAgoISO(2),
      created_at: hoursAgo(46),
    }),
    item('demo-item-4', 'lost', 3, {
      image_url: '/demo-photos/charger.jpg',
      title: 'HP laptop charger',
      description: 'Black 65W HP laptop charger with round pin. Name tag "Arjun" stuck on the brick.',
      category: 'Electronics',
      color: 'Black',
      brand: 'HP',
      location: 'Computer Lab 204',
      date: daysAgoISO(7),
      created_at: hoursAgo(165),
    }),
    item('demo-item-5', 'lost', 2, {
      image_url: '/demo-photos/id-card.jpg',
      title: 'Student ID card',
      description: 'College ID card in a red lanyard. Name: Priya Sharma, Dept. of Computer Science.',
      category: 'ID & Cards',
      color: 'Red',
      location: 'Sports complex',
      date: daysAgoISO(1),
      created_at: hoursAgo(20),
    }),
    item('demo-item-6', 'lost', 1, {
      image_url: '/demo-photos/earbuds.jpg',
      title: 'White AirPods Pro case',
      description: 'White AirPods Pro charging case with both earbuds inside. Has a small scratch on the lid.',
      category: 'Electronics',
      color: 'White',
      brand: 'Apple',
      location: 'Main Auditorium',
      date: daysAgoISO(9),
      created_at: hoursAgo(212),
    }),

    // ---------------- FOUND reports ----------------
    item('demo-item-7', 'found', 2, {
      image_url: '/demo-photos/phone.jpg',
      title: 'Black Apple smartphone in blue case',
      description: 'Found a black iPhone with a blue cover under a desk on the second floor of the library. Screen has a small crack.',
      category: 'Electronics',
      color: 'Black',
      brand: 'Apple',
      location: 'Central Library, 2nd floor',
      date: daysAgoISO(2),
      created_at: hoursAgo(44),
    }),
    item('demo-item-8', 'found', 4, {
      image_url: '/demo-photos/wallet.jpg',
      title: 'Leather wallet with metro card',
      description: 'Brown wallet found near the canteen counter. Contains a metro card and an ID. Handed over to the security office.',
      category: 'Wallets & Purses',
      color: 'Brown',
      location: 'Canteen counter',
      date: daysAgoISO(4),
      created_at: hoursAgo(90),
    }),
    item('demo-item-9', 'found', 3, {
      image_url: '/demo-photos/keys.jpg',
      title: 'Set of keys with red keychain',
      description: 'Three keys on a red rubber keychain, one looks like a bike key.',
      category: 'Keys',
      color: 'Red',
      location: 'Parking lot B',
      date: daysAgoISO(1),
      created_at: hoursAgo(26),
    }),
    item('demo-item-10', 'found', 4, {
      image_url: '/demo-photos/earbuds.jpg',
      title: 'White wireless earbuds case',
      description: 'White earbuds charging case found on a seat in row F of the auditorium after the seminar.',
      category: 'Electronics',
      color: 'White',
      location: 'Auditorium, row F',
      date: daysAgoISO(8),
      created_at: hoursAgo(190),
    }),
    item('demo-item-11', 'found', 2, {
      image_url: '/demo-photos/bottle.jpg',
      title: 'Blue steel water bottle',
      description: 'Blue Milton steel bottle with stickers, left on the bench in the gym.',
      category: 'Water Bottles',
      color: 'Blue',
      brand: 'Milton',
      location: 'Gym, ground floor',
      date: daysAgoISO(3),
      created_at: hoursAgo(66),
    }),
    item('demo-item-12', 'found', 3, {
      image_url: '/demo-photos/backpack.jpg',
      title: 'Navy blue backpack with notebooks',
      description: 'Navy backpack found on the bench at the main gate bus stop. Contains notebooks, a pencil pouch and an umbrella.',
      category: 'Bags',
      color: 'Blue',
      location: 'Main gate bus stop',
      date: daysAgoISO(1),
      created_at: hoursAgo(22),
    }),
    item('demo-item-13', 'found', 2, {
      image_url: '/demo-photos/calculator.jpg',
      title: 'Casio scientific calculator',
      description: 'Grey Casio fx-991EX calculator left in the lab after the practical exam.',
      category: 'Books & Stationery',
      color: 'Gray',
      brand: 'Casio',
      location: 'Physics Lab 101',
      date: daysAgoISO(6),
      created_at: hoursAgo(140),
    }),
    item('demo-item-14', 'found', 1, {
      image_url: '/demo-photos/hoodie.jpg',
      title: 'Grey hoodie',
      description: 'Grey zip hoodie, size M, left on a chair in the seminar hall. Has a college fest logo on the back.',
      category: 'Clothing',
      color: 'Gray',
      location: 'Seminar Hall 3',
      date: daysAgoISO(2),
      created_at: hoursAgo(40),
    }),

    // ---------------- An already RETURNED item (shows the finished workflow) ----------------
    item('demo-item-15', 'found', 2, {
      image_url: '/demo-photos/umbrella.jpg',
      title: 'Black umbrella with wooden handle',
      description: 'Black folding umbrella with a curved wooden handle, left at the library entrance stand.',
      category: 'Accessories',
      color: 'Black',
      location: 'Central Library entrance',
      date: daysAgoISO(12),
      status: 'resolved',
      created_at: hoursAgo(290),
    }),
  ]
}

export function buildDemoClaims() {
  return [
    {
      id: 'demo-claim-1',
      item_id: 'demo-item-10',
      owner_id: user(4).id,
      claimant_id: user(1).id,
      claimant_name: user(1).name,
      claimant_contact: 'demo@findback.app',
      message: 'I think these are my AirPods Pro. There is a small scratch on the lid and they are paired to "Demo\'s AirPods".',
      status: 'pending',
      response_note: '',
      created_at: hoursAgo(30),
    },
    {
      id: 'demo-claim-2',
      item_id: 'demo-item-14',
      owner_id: user(1).id,
      claimant_id: user(3).id,
      claimant_name: user(3).name,
      claimant_contact: 'arjun@findback.app',
      message: 'That is my hoodie from TechFest 2025. There should be a metro card receipt in the left pocket.',
      status: 'pending',
      response_note: '',
      created_at: hoursAgo(12),
    },
    {
      id: 'demo-claim-3',
      item_id: 'demo-item-15',
      owner_id: user(2).id,
      claimant_id: user(4).id,
      claimant_name: user(4).name,
      claimant_contact: 'neha@findback.app',
      message: 'My umbrella - the handle has "NP" carved near the bottom and one spoke is bent.',
      status: 'approved',
      response_note: 'Verified the initials. Collected from the library help desk on Monday.',
      created_at: hoursAgo(270),
    },
  ]
}
