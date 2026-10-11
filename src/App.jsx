import { useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import Layout, { ProtectedRoute } from './components/Layout'
import { EmptyState } from './components/ui'
import Landing from './pages/Landing'
import { Login, Signup } from './pages/Auth'
import Dashboard from './pages/Dashboard'
import ReportItem, { EditReport } from './pages/ReportItem'
import Browse from './pages/Browse'
import ItemDetails from './pages/ItemDetails'
import MyReports from './pages/MyReports'
import Claims from './pages/Claims'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

function NotFound() {
  return (
    <div className="container-page py-16">
      <EmptyState
        icon="search"
        title="Page not found"
        text="The page you are looking for does not exist."
        action={<Link to="/" className="btn-primary">Go home</Link>}
      />
    </div>
  )
}

const protect = (el) => <ProtectedRoute>{el}</ProtectedRoute>

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/items/:id" element={<ItemDetails />} />
          <Route path="/dashboard" element={protect(<Dashboard />)} />
          <Route path="/report/lost" element={protect(<ReportItem key="lost" type="lost" />)} />
          <Route path="/report/found" element={protect(<ReportItem key="found" type="found" />)} />
          <Route path="/items/:id/edit" element={protect(<EditReport />)} />
          <Route path="/my-reports" element={protect(<MyReports />)} />
          <Route path="/claims" element={protect(<Claims />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  )
}
