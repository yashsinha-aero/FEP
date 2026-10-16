import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the FEP landing page', () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  expect(screen.getAllByText(/Foreign Exposure/i).length).toBeGreaterThan(0);
});
