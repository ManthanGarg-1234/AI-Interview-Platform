import { Component } from "react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
          <section className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-950">We hit an unexpected error</h1>
            <p className="mt-2 text-slate-600">Refresh the page to try again. Your work has not been submitted.</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white hover:bg-indigo-700">
              Refresh page
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
