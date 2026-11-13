import { useEffect, useState } from "react";
import { api } from "@/api/mock";
import { useRuntime } from "@/api/useRuntime";
import { listFolders, normalizeFolder } from "@/entities/file/types";
import { useAuth } from "@/features/auth/useAuth";
import { FileToolbar } from "@/features/files/FileToolbar";
import { FileTree } from "@/features/files/FileTree";
import { Button, Label, Modal, PageHeader, Select, TextInput } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";
export function FilesPage() {
  const { files, folders = [] } = useRuntime();
  const { user, pwr } = useAuth();
  const { showToast } = useToast();
  useEffect(() => { void api.refreshFiles().catch(error => showToast(error.message)); }, [showToast]);
  const [selected, setSelected] = useState("");
  const [parent, setParent] = useState("");
  const [folderName, setFolderName] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dialog, setDialog] = useState<"folder" | "upload" | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "folder" | "file"; name: string } | null>(null);
  const [pending, setPending] = useState(false);
  const folderOptions = listFolders(files, folders);
  const fail = (error: unknown) => showToast(error instanceof Error ? error.message : "Операция не выполнена");
  const open = (mode: "folder" | "upload") => { setParent(selected); setFolderName(""); setComment(""); setFile(null); setDialog(mode); };
  const save = async () => {
    if (!user || !pwr.canFilesManage || pending) return;
    if (dialog === "folder" && !folderName.trim()) { showToast("Введите имя папки"); return; }
    if (dialog === "upload" && !file) { showToast("Выберите файл"); return; }
    setPending(true);
    try {
      if (dialog === "folder") { const path = await api.createFolder(user, parent, folderName.trim()); setSelected(path); showToast("Папка создана"); }
      else if (file) { await api.uploadFile(user, file, parent, comment); setSelected(parent); showToast("Файл загружен"); }
      setDialog(null);
    } catch (error) { fail(error); } finally { setPending(false); }
  };
  const remove = async () => {
    if (!user || !pwr.canFilesManage || !deleting || pending) return;
    setPending(true);
    try {
      if (deleting.kind === "folder") {
        await api.deleteFolder(user, deleting.name);
        if (selected === deleting.name || selected.startsWith(deleting.name + " / ")) setSelected("");
      } else await api.deleteFile(user, deleting.name);
      setDeleting(null); showToast("Удаление выполнено");
    } catch (error) { fail(error); } finally { setPending(false); }
  };
  const deletionCount = deleting?.kind === "folder" ? files.filter(item => { const path = normalizeFolder(item.folder); return path === deleting.name || path.startsWith(deleting.name + " / "); }).length : 1;
  return <>
    <PageHeader title="Файловое хранилище" description="Документы, папки и комментарии к файлам." />
    <FileToolbar canManage={pwr.canFilesManage} onCreate={() => open("folder")} onUpload={() => open("upload")} />
    <FileTree onCreate={() => open("folder")} onUpload={() => open("upload")} files={files} folders={folders} selected={selected} onSelect={setSelected} canManage={pwr.canFilesManage}
      onDownload={name => { if (user) void api.downloadFile(user, name).catch(fail); }}
      onDelete={name => setDeleting({ kind: "file", name })} onDeleteFolder={name => setDeleting({ kind: "folder", name })} />
    {dialog && <Modal title={dialog === "folder" ? "Создать папку" : "Загрузить файл"} dismissible={!pending} onClose={() => setDialog(null)}>
      <form className="space-y-4 p-6" onSubmit={event => { event.preventDefault(); void save(); }}>
        <h2 className="text-lg font-semibold">{dialog === "folder" ? "Создать папку" : "Загрузить файл"}</h2>
        <div><Label htmlFor="file-parent">Родительская папка</Label><Select id="file-parent" disabled={pending} value={parent} onChange={event => setParent(event.target.value)}><option value="">Корень хранилища</option>{folderOptions.map(path => <option key={path} value={path}>{path}</option>)}</Select></div>
        {dialog === "folder" ? <div><Label htmlFor="folder-name">Имя новой папки</Label><TextInput id="folder-name" autoFocus disabled={pending} value={folderName} onChange={event => setFolderName(event.target.value)} /></div> : <>
          <div><Label htmlFor="upload-file">Файл</Label><TextInput id="upload-file" type="file" disabled={pending} onChange={event => setFile(event.target.files?.[0] || null)} /></div>
          <div><Label htmlFor="file-comment">Комментарий</Label><TextInput id="file-comment" disabled={pending} value={comment} onChange={event => setComment(event.target.value)} /></div>
        </>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? "Выполнение…" : dialog === "folder" ? "Создать папку" : "Загрузить файл"}</Button></div>
      </form>
    </Modal>}
    {deleting && <Modal title="Подтверждение удаления" dismissible={!pending} onClose={() => setDeleting(null)}><div className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">Удалить {deleting.kind === "folder" ? "папку и её содержимое" : "файл"}?</h2><p className="break-all font-medium">{deleting.name}</p>
      <p className="text-sm leading-6 text-muted-foreground">{deleting.kind === "folder" ? `Будут удалены все вложенные папки и файлы. Файлов: ${deletionCount}. ` : ""}Отменить удаление будет невозможно.</p>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={() => setDeleting(null)}>Отмена</Button><Button variant="danger" disabled={pending} onClick={() => void remove()}>{pending ? "Удаление…" : "Удалить"}</Button></div>
    </div></Modal>}
  </>;
}
