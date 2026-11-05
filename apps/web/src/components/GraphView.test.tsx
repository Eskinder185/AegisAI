import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import GraphView from './GraphView'

const graph = {
  legend: 'Solid edges are observed. Dashed edges are hypotheses.',
  nodes: [
    { id: 'asset', label: 'Role', type: 'asset', status: 'observed' },
    { id: 'v:1', label: 'Wildcard action', type: 'vulnerability', status: 'observed', severity: 'critical', fix: 'List actions', evidence_ids: ['OBS-IAM-001'] },
    { id: 'v:2', label: 'Possible escalation', type: 'vulnerability', status: 'hypothetical', severity: 'high', inferred: ['might'] },
  ],
  edges: [
    { from: 'v:1', to: 'asset', label: 'weakens (observed in fixture)', confirmed: true },
    { from: 'v:2', to: 'asset', label: 'weakens (hypothesis)', confirmed: false },
  ],
}
const renderIt = () => render(<MemoryRouter><GraphView graph={graph as any} /></MemoryRouter>)

describe('GraphView', () => {
  it('labels hypotheses and never calls them confirmed', async () => {
    renderIt()
    await userEvent.click(screen.getByRole('button', { name: /Possible escalation \(hypothesis\)/ }))
    expect(screen.getByText(/This is a hypothesis, not a confirmed compromise/)).toBeInTheDocument()
  })
  it('can hide hypotheses', async () => {
    renderIt()
    await userEvent.click(screen.getByLabelText('show hypotheses'))
    expect(screen.queryByRole('button', { name: /Possible escalation/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Wildcard action/ })).toBeInTheDocument()
  })
  it('selection shows evidence and recommended action; list view is available', async () => {
    renderIt()
    await userEvent.click(screen.getByRole('button', { name: /vulnerability: Wildcard action/ }))
    expect(screen.getByText('List actions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy evidence id OBS-IAM-001/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show as accessible list' }))
    expect(screen.getByRole('table', { name: 'Nodes and their relationships' })).toBeInTheDocument()
  })
})
