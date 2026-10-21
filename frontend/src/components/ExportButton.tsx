import { Button } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { download } from '../lib/api';
import { toastError } from '../lib/notify';
import { useCan } from '../shell/permissions';

export function ExportButton({ resource, path, fileName }: { resource: string; path: string; fileName: string }) {
  const can = useCan(`${resource}:export`);
  const [busy, setBusy] = useState(false);
  if (!can) return null;
  return (
    <Button
      variant="default"
      leftSection={<IconDownload size={15} />}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await download(path, fileName);
        } catch (e) {
          toastError(e, 'Chưa xuất được file');
        } finally {
          setBusy(false);
        }
      }}
    >
      Xuất file
    </Button>
  );
}
