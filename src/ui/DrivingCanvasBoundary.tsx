import { Component, type ErrorInfo, type ReactNode } from 'react'

interface DrivingCanvasBoundaryProps {
  children: ReactNode
  onError: (error: Error, info: ErrorInfo) => void
}

interface DrivingCanvasBoundaryState {
  failed: boolean
}

/**
 * Keeps a renderer-initialization failure inside the driving surface instead
 * of letting an unavailable/exhausted GPU context unmount the whole app.
 * The parent switches to the recoverable WebGL fallback after componentDidCatch.
 */
export class DrivingCanvasBoundary extends Component<
  DrivingCanvasBoundaryProps,
  DrivingCanvasBoundaryState
> {
  state: DrivingCanvasBoundaryState = { failed: false }

  static getDerivedStateFromError(): DrivingCanvasBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(error, info)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
