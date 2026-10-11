import { Group } from '@mantine/core';
import type { ReactNode } from 'react';
import { PageTitle } from './PageTitle';

interface Props {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <Group justify="space-between" align="center" wrap="wrap" mb="md" gap="sm">
      <div style={{ minWidth: 0 }}>
        <PageTitle title={title} description={subtitle} />
      </div>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  );
}
