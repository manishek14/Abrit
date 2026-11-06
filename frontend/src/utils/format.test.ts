import { DEPARTMENT_LABELS, formatDepartment, ticketUserLabel, userDisplayName } from './format';
import type { TelegramUser } from '../types';

describe('formatDepartment (feature round)', () => {
  it('maps every department to its Persian label', () => {
    expect(DEPARTMENT_LABELS.FINANCE).toBe('مالی');
    expect(DEPARTMENT_LABELS.SUPPORT).toBe('پشتیبانی');
    expect(DEPARTMENT_LABELS.TECHNICAL).toBe('فنی');
    expect(DEPARTMENT_LABELS.SUGGESTIONS).toBe('پیشنهادات و انتقادات');
  });

  it('renders a dash for legacy tickets without a department', () => {
    expect(formatDepartment(null)).toBe('—');
    expect(formatDepartment(undefined)).toBe('—');
    expect(formatDepartment('TECHNICAL')).toBe('فنی');
  });
});
