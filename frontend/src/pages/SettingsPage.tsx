import { useEffect, useMemo } from 'react';
import {
  Alert,
  App as AntdApp,
  AutoComplete,
  Button,
  Card,
  Form,
  Input,
  Space,
  Switch,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import {
  useAssistantModels,
  useAssistantSettings,
  useUpdateAssistantSettings,
} from '../api/hooks';
import { getApiErrorMessage } from '../api/client';
import { formatDateTime } from '../utils/format';
import type { AssistantModel } from '../types';

interface SettingsFormValues {
  system_prompt: string;
  model: string;
  is_active: boolean;
}

export function SettingsPage(): JSX.Element {
  const { message: antdMessage } = AntdApp.useApp();
  const [form] = Form.useForm<SettingsFormValues>();

  const settingsQuery = useAssistantSettings();
  const modelsQuery = useAssistantModels();
  const saveMutation = useUpdateAssistantSettings();

  const settings = settingsQuery.data;

  useEffect(() => {
    if (settings) {
      form.setFieldsValue({
        system_prompt: settings.system_prompt,
        model: settings.model,
        is_active: settings.is_active,
      });
    }
  }, [settings, form]);

  const modelOptions = useMemo(
    () =>
      (modelsQuery.data?.models ?? []).map((model: AssistantModel) => ({
        value: model.id,
        label: model.label ? `${model.label} — ${model.id}` : model.id,
      })),
    [modelsQuery.data],
  );

  const handleFinish = async (values: SettingsFormValues): Promise<void> => {
    try {
      const updated = await saveMutation.mutateAsync({
        system_prompt: values.system_prompt.trim(),
        model: values.model.trim(),
        is_active: values.is_active,
      });
      antdMessage.success(
        `Assistant settings saved · updated ${dayjs(updated.updated_at).format('HH:mm:ss')}`,
      );
    } catch (error) {
      // e.g. 400 on empty prompt/model — surface the backend message.
      antdMessage.error(getApiErrorMessage(error, 'Failed to save assistant settings.'));
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Typography.Title level={3} style={{ margin: 0 }}>
          Assistant Settings
        </Typography.Title>
        {settings && (
          <Typography.Text type="secondary">
            Last updated {formatDateTime(settings.updated_at)} ({dayjs(settings.updated_at).fromNow()})
          </Typography.Text>
        )}
      </div>

      {settingsQuery.isError && !settings && (
        <Alert
          type="error"
          showIcon
          message="Failed to load assistant settings"
          description={getApiErrorMessage(settingsQuery.error)}
          action={
            <Button size="small" onClick={() => void settingsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      <Card loading={settingsQuery.isLoading && !settings} style={{ maxWidth: 860 }}>
        <Form<SettingsFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void handleFinish(values)}
        >
          <Form.Item
            label="System prompt"
            name="system_prompt"
            rules={[{ required: true, whitespace: true, message: 'System prompt is required.' }]}
          >
            <Input.TextArea
              rows={8}
              placeholder="You are a helpful Telegram support assistant…"
            />
          </Form.Item>

          <Form.Item
            label="Model"
            name="model"
            rules={[{ required: true, whitespace: true, message: 'Model is required.' }]}
          >
            <AutoComplete
              options={modelOptions}
              placeholder="e.g. openrouter/gpt-4o-mini"
              filterOption={(inputValue, option) =>
                String(option?.value ?? '')
                  .toLowerCase()
                  .includes(inputValue.trim().toLowerCase())
              }
            />
          </Form.Item>
          {modelsQuery.data && (
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -16 }}>
              {modelsQuery.data.source === 'openrouter'
                ? `Model list fetched from OpenRouter${
                    modelsQuery.data.fetchedAt
                      ? ` (updated ${dayjs(modelsQuery.data.fetchedAt).fromNow()})`
                      : ''
                  }. You may also type any model id.`
                : 'Built-in fallback model list — type any model id you need.'}
            </Typography.Text>
          )}

          <Form.Item label="Assistant active" name="is_active" valuePropName="checked" style={{ marginTop: 24 }}>
            <Switch checkedChildren="Active" unCheckedChildren="Disabled" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: -12 }}>
            When disabled, the assistant stops generating AI replies.
          </Typography.Text>

          <Space style={{ marginTop: 32 }}>
            <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
              Save changes
            </Button>
            <Button
              disabled={!settings}
              onClick={() => {
                if (!settings) return;
                form.setFieldsValue({
                  system_prompt: settings.system_prompt,
                  model: settings.model,
                  is_active: settings.is_active,
                });
              }}
            >
              Reset
            </Button>
          </Space>
        </Form>
      </Card>
    </Space>
  );
}
