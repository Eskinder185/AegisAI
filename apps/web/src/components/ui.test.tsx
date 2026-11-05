import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ApiError } from '../lib/api'
import { Btn, Diff, ErrorState, Label, Modal, Sev, Status, SevBar, Trend } from './ui'

describe('status labels', () => {
  it('renders truthful evidence labels', () => {
    render(<><Label k="SIMULATED" /><Label k="VERIFIED_FIXED" /><Label k="UNCONFIGURED" /></>)
    expect(screen.getByText('Simulated')).toBeInTheDocument()
    expect(screen.getByText('Verified (simulated)')).toBeInTheDocument()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
  })
  it('formats snake_case status and severity', () => {
    render(<><Status s="not_improved" /><Sev s="high" /></>)
    expect(screen.getByText('not improved')).toHaveClass('danger')
    expect(screen.getByText('high')).toHaveClass('high')
  })
})

describe('ErrorState', () => {
  it('shows permission denied without a retry button', () => {
    render(<ErrorState error={new ApiError(403, 'forbidden', 'Needs analyst.')} retry={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Permission denied')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
  it('offers retry on other errors and shows request id', async () => {
    const retry = vi.fn()
    render(<ErrorState error={new ApiError(500, 'internal_error', 'Boom', 'req-1')} retry={retry} />)
    expect(screen.getByText(/req-1/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
  })
})

describe('Modal', () => {
  function Host() {
    const [open, setOpen] = useState(false)
    return (<><Btn onClick={() => setOpen(true)}>Open</Btn>{open && <Modal title="Confirm" onClose={() => setOpen(false)}><button>Inside</button></Modal>}</>)
  }
  it('is a labelled dialog, closes on Escape and restores focus', async () => {
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })
  it('traps Tab focus', async () => {
    render(<Host />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.tab(); await userEvent.tab(); await userEvent.tab()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })
})

describe('charts have text equivalents', () => {
  it('SevBar describes counts', () => {
    render(<SevBar counts={{ critical: 1, high: 2, medium: 0, low: 3 }} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '1 critical, 2 high, 0 medium, 3 low')
  })
  it('Trend refuses to draw one point', () => {
    render(<Trend points={[3]} label="x" />)
    expect(screen.getByText(/at least twice/)).toBeInTheDocument()
  })
  it('Diff classifies lines', () => {
    render(<Diff lines={['+ a', '- b', '~ c']} />)
    expect(screen.getByText('+ a')).toHaveClass('add')
    expect(screen.getByText('- b')).toHaveClass('del')
  })
})
