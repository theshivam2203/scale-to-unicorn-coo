// @vitest-environment jsdom
// Renders the real app and clicks through the founder journey.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from './App';
import { useStore } from './store/store';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});
afterEach(cleanup);

const go = async (path: string) => act(async () => { window.location.hash = path; window.dispatchEvent(new HashChangeEvent('hashchange')); });

describe('UI journey', () => {
  it('every page renders without errors', async () => {
    act(() => useStore.getState().resetDemo());
    render(<App />);
    for (const [path, heading] of [
      ['/', 'Needs attention now'], ['/command', 'AI COO Command Center'], ['/briefing', 'Daily Briefing'], ['/leads', 'Leads & CRM'],
      ['/follow-up', 'Follow-up Autopilot'], ['/approvals', 'Approval Queue'], ['/operations', 'Operations'], ['/revenue', 'Revenue Intelligence'],
      ['/audit', 'Audit Log'], ['/integrations', 'Integrations & Safety'],
    ]) {
      await go(path);
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    }
  });

  it('command → drawer → draft → approve updates the dashboard', async () => {
    act(() => useStore.getState().resetDemo());
    render(<App />);
    await go('/');
    expect(screen.getByText('Leads requiring follow-up').parentElement!.textContent).toContain('7');

    await go('/command');
    fireEvent.click(screen.getAllByText('Find every lead that has not been contacted in the last 24 hours.')[0]);
    await waitFor(() => expect(screen.getByText(/7 leads not contacted/)).toBeTruthy(), { timeout: 2000 });

    // Open Sarah from the result rows
    fireEvent.click(screen.getByText('Sarah Whitfield · Harbor & Pine Home'));
    const drawer = await screen.findByText('AI COO recommendation');
    expect(drawer).toBeTruthy();
    fireEvent.click(screen.getByText('Generate follow-up'));
    const approveBtn = await screen.findByText('Approve & send (demo)');
    await act(async () => { fireEvent.click(approveBtn); });
    await waitFor(() => expect(useStore.getState().leads.find((l) => l.id === 'L01')!.followUp).toBe('sent'), { timeout: 3000 });

    act(() => useStore.getState().openLead(null));
    await go('/');
    await waitFor(() => expect(screen.getByText('Leads requiring follow-up').parentElement!.textContent).toContain('6'));
    expect(screen.getByText('Tasks completed by AI').parentElement!.textContent).toContain('3');

    // Approval history shows the completed simulated action
    await go('/approvals');
    fireEvent.click(screen.getByText(/Completed \(simulated\)/));
    expect(screen.getAllByText(/not delivered/).length).toBeGreaterThan(0);

    // Audit log has the trail
    await go('/audit');
    const list = screen.getAllByText(/Sarah Whitfield/);
    expect(list.length).toBeGreaterThan(0);
    expect(within(document.body).getAllByText(/Executed \(simulated\)/).length).toBeGreaterThan(0);
  });
});
