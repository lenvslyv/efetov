import { useEffect, useRef, useState } from "react";
import { api } from "@/api/mock";
import { tryApi } from "@/api/errors";
import { useRuntime } from "@/api/useRuntime";
import { listFolders } from "@/entities/file/types";
import { useAuth } from "@/features/auth/useAuth";
import { FileToolbar } from "@/features/files/FileToolbar";
import { FileTree } from "@/features/files/FileTree";
import { PageHeader } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";

export function FilesPage() {
  const { files, folders = [] } = useRuntime();
  const { user, pwr } = useAuth();
  const { showToast } = useToast();
  useEffect(() => {
    void api.refreshFiles().catch(error => showToast(error.message));
  }, [showToast]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [parent, setParent] = useState("");
  const [folderName, setFolderName] = useState("");
  const [comment, setComment] = useState("");
  const folderOptions = listFolders(files, folders);

  const fail = (error: unknown) => {
    showToast(error instanceof Error ? error.message : "Операция не выполнена");
  };

  return (
    <>
      <PageHeader
        title="Файловое хранилище"
        description="Папки и файлы по месяцам и врачам."
      />
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (!selected || !user) return;
          void (async () => {
            try {
              const saved = await tryApi(
                () => api.uploadFile(user, selected, parent, comment),
                (error) => showToast(error.message)
              );
              if (!saved.ok) return;
              setComment("");
              showToast("Файл загружен");
            } catch (error) {
              fail(error);
            }
          })();
        }}
      />
      <FileToolbar
        canManage={pwr.canFilesManage}
        folders={folderOptions}
        parent={parent}
        folderName={folderName}
        comment={comment}
        onParent={setParent}
        onFolderName={setFolderName}
        onComment={setComment}
        onUploadClick={() => fileInput.current?.click()}
        onCreateFolder={() => {
          if (!user) return;
          const name = folderName.trim();
          if (!name) {
            showToast("Введите имя папки");
            return;
          }
          void (async () => {
            try {
              const saved = await tryApi(
                () => api.createFolder(user, parent, name),
                (error) => showToast(error.message)
              );
              if (!saved.ok) return;
              setParent(saved.value);
              setFolderName("");
              showToast("Папка создана");
            } catch (error) {
              fail(error);
            }
          })();
        }}
      />
      <FileTree
        files={files}
        folders={folders}
        canManage={pwr.canFilesManage}
        onDownload={(name) => {
          if (!user) return;
          void (async () => {
            try {
              await api.downloadFile(user, name);
            } catch (error) {
              fail(error);
            }
          })();
        }}
        onDeleteFolder={async (path) => {
          if (!user || !pwr.canFilesManage) return;
          const count = files.filter(file => file.folder === path || file.folder.startsWith(path + " / ")).length;
          if (!window.confirm(`Удалить папку «${path}» и всё её содержимое?\nБудут удалены все вложенные папки и файлы (файлов: ${count}).\nОтменить удаление будет невозможно.`)) return;
          const result = await tryApi(() => api.deleteFolder(user, path), error => showToast(error.message));
          if (result.ok) {
            if (parent === path || parent.startsWith(path + " / ")) setParent("");
            showToast("Папка удалена со всем содержимым");
          }
        }}
        onDelete={async (name) => {
          if (!user) return;
          try {
            const removed = await tryApi(
              () => api.deleteFile(user, name),
              (error) => showToast(error.message)
            );
            if (removed.ok) showToast("Файл удален");
          } catch (error) {
            fail(error);
          }
        }}
      />
    </>
  );
}
