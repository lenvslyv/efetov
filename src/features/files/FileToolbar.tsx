import { FolderPlus, Upload } from "lucide-react";
import { Badge, Button } from "@/shared/ui";
export function FileToolbar({ canManage, onCreate, onUpload }: { canManage: boolean; onCreate: () => void; onUpload: () => void }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{canManage ? <><Button onClick={onUpload}><Upload />Загрузить файл</Button><Button variant="secondary" onClick={onCreate}><FolderPlus />Создать папку</Button></> : <Badge tone="slate">Доступно скачивание файлов</Badge>}</div>;
}
