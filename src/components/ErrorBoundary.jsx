import { Component } from 'react'
import Icon from './Icon'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('FindBack ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) {
      this.props.onReset()
    } else {
      window.location.href = '/'
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
          <div className="card w-full max-w-lg p-6 sm:p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 text-rose-600">
              <Icon name="alert" className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              An unexpected error occurred while rendering this page. You can try refreshing or returning to the home page.
            </p>
            {this.state.error?.message && (
              <div className="mt-4 overflow-hidden rounded-xl bg-slate-50 p-3 text-left">
                <p className="text-xs font-mono text-slate-600 break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="btn-primary"
              >
                Go to Home
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="btn-secondary"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
