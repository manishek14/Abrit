import { useMemo } from 'react';
import { Badge, Button, Layout, Menu, theme, Tooltip, Typography } from 'antd';
import {
  DashboardOutlined,
  LogoutOutlined,
  SettingOutlined,
  SolutionOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const { Header, Sider, Content } = Layout;

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/tickets', icon: <SolutionOutlined />, label: 'Tickets' },
  { key: '/users', icon: <UserOutlined />, label: 'Users' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

export function AdminLayout(): JSX.Element {
  const { admin, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const selectedKey = useMemo<string>(() => {
    const segment = location.pathname.split('/')[1];
    if (segment === 'tickets' || segment === 'users' || segment === 'settings') {
      return `/${segment}`;
    }
    return '/';
  }, [location.pathname]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={216} breakpoint="lg" collapsedWidth={0}>
        <div className="sider-brand">AbrIT Admin</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          className="app-header"
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingInline: 24,
          }}
        >
          <Typography.Text strong className="app-header__title">AbrIT Support Panel</Typography.Text>
          <div className="app-header__actions">
            <Tooltip
              title={connected ? 'Realtime connected — live updates enabled.' : 'Realtime offline — data auto-refreshes via polling.'}
            >
              <Badge status={connected ? 'success' : 'default'} text={connected ? 'Live' : 'Polling'} />
            </Tooltip>
            <Typography.Text>{admin?.name ?? 'Admin'}</Typography.Text>
            <Button icon={<LogoutOutlined />} type="text" onClick={logout}>
              Sign out
            </Button>
          </div>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
