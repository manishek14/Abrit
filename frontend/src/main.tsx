import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App as AntdApp, ConfigProvider, type ThemeConfig } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import App from './App';
import { queryClient } from './api/queryClient';
import './styles.css';

dayjs.extend(relativeTime);

/**
 * AbrIT visual identity (design tokens, review fix): one theme shared with
 * the CSS custom properties in styles.css — moves the panel away from the
 * default AntD look while keeping the component library intact.
 */
const theme: ThemeConfig = {
  token: {
    colorPrimary: '#4f46e5',
    colorInfo: '#4f46e5',
    colorLink: '#4f46e5',
    colorBgLayout: '#f5f6fa',
    borderRadius: 8,
    fontFamily:
      "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', 'Vazirmatn', 'Iran Sans', Arial, sans-serif",
  },
  components: {
    Layout: { siderBg: '#1e1b4b', headerBg: '#ffffff' },
    Table: { headerBg: '#f8f9fc', rowHoverBg: 'rgba(79, 70, 229, 0.04)' },
    Card: { boxShadow: '0 1px 2px rgba(17, 24, 39, 0.04), 0 1px 3px rgba(17, 24, 39, 0.06)' },
  },
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={theme}>
        <AntdApp>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AntdApp>
      </ConfigProvider>
    </QueryClientProvider>
  </StrictMode>,
);
