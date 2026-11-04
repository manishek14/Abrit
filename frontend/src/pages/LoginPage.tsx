import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, App as AntdApp, Button, Card, Form, Input, Space, Typography } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../api/client';

interface LoginFormData {
  email: string;
  password: string;
}

export function LoginPage(): JSX.Element {
  const { token, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { message: antdMessage } = AntdApp.useApp();

  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const state = location.state as { from?: string } | null;
  const returnTo =
    typeof state?.from === 'string' && state.from.startsWith('/') && !state.from.startsWith('/login')
      ? state.from
      : '/';

  if (token) {
    return <Navigate to={returnTo} replace />;
  }

  const handleFinish = async (values: LoginFormData): Promise<void> => {
    setSubmitting(true);
    setErrorText(null);
    try {
      await login(values.email, values.password);
      antdMessage.success('Signed in successfully.');
      navigate(returnTo, { replace: true });
    } catch (error) {
      setErrorText(getApiErrorMessage(error, 'Sign in failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card">
        <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 24 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            AbrIT Admin
          </Typography.Title>
          <Typography.Text type="secondary">Sign in to the support panel</Typography.Text>
        </Space>

        {errorText && (
          <Alert
            type="error"
            showIcon
            closable
            message={errorText}
            style={{ marginBottom: 16 }}
            onClose={() => setErrorText(null)}
          />
        )}

        <Form<LoginFormData>
          layout="vertical"
          requiredMark={false}
          initialValues={{ email: '', password: '' }}
          onFinish={(values) => void handleFinish(values)}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter your email.' },
              { type: 'email', message: 'Please enter a valid email address.' },
            ]}
          >
            <Input
              size="large"
              prefix={<MailOutlined />}
              placeholder="admin@abrit.local"
              autoComplete="email"
              autoFocus
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Please enter your password.' }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="Password"
              autoComplete="current-password"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
