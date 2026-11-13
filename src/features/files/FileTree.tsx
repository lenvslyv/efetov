import { useState } from "react";
import { Download, File, FileImage, FileSpreadsheet, FileText, FolderOpen, FolderTree, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { listFolders, normalizeFolder, type StoredFile } from "@/entities/file/types";
import { ActionMenu } from "@/shared/ui/ActionMenu";
import { Button, Card } from "@/shared/ui";
function FileIcon({ name }: { name: string }) {
  const Icon = /\.(xlsx?|csv)$/i.test(name) ? FileSpreadsheet : /\.(png|jpe?g|gif|webp)$/i.test(name) ? FileImage : /\.(docx?|pdf|txt)$/i.test(name) ? FileText : File;
  return <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />;
}
export function FileTree({ files, folders = [], selected, onSelect, canManage, onDownload, onDelete, onDeleteFolder, onCreate, onUpload }: {
  files: StoredFile[]; folders?: string[]; selected: string; onSelect: (path: string) => void; canManage: boolean;
  onCreate?: () => void; onUpload?: () => void;
  onDownload: (name: string) => void; onDelete: (name: string) => void; onDeleteFolder: (path: string) => void;
}) {
  const [showFolders, setShowFolders] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const paths = listFolders(files, folders);
  const visibleFiles = files.filter(file => normalizeFolder(file.folder) === selected);
  const children = paths.filter(path => (path.includes(" / ") ? path.slice(0, path.lastIndexOf(" / ")) : "") === selected);
  const crumbs = selected ? selected.split(" / ") : [];
  return <Card className="files-explorer relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="shrink-0 border-b p-3 lg:hidden"><Button variant="secondary" aria-expanded={showFolders} onClick={() => setShowFolders(!showFolders)}><FolderTree />Папки</Button></div>
    <div className="files-pane-grid grid min-h-0 min-w-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <nav aria-label="Папки хранилища" className={`${showFolders ? "block" : "hidden"} files-folders overflow-auto border-b bg-slate-50 p-3 lg:block lg:border-b-0 lg:border-r`}>
        <button type="button" aria-current={!selected ? "location" : undefined} className={`touch-target mb-2 flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${!selected ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`} onClick={() => { onSelect(""); setShowFolders(false); }}><FolderOpen className="size-4" />Корень хранилища</button>
        <ul className="folder-tree" aria-label="Дерево папок">{paths.filter(path => !path.includes(" / ")).map(path => <FolderBranch key={path} path={path} paths={paths} files={files} selected={selected} collapsed={collapsed}
          onToggle={path => setCollapsed(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; })}
          onSelect={path => { onSelect(path); setShowFolders(false); }} />)}</ul>
      </nav>
      <div className="files-content min-h-0 min-w-0 overflow-auto">
        <div className="files-path sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background p-4">
          <nav aria-label="Путь к папке" className="flex min-w-0 flex-wrap items-center gap-1 text-sm"><button type="button" className="rounded p-1 text-primary hover:underline" onClick={() => onSelect("")}>Хранилище</button>
            {crumbs.map((crumb, index) => <span key={index} className="flex min-w-0 items-center gap-1"><ChevronRight className="size-3 shrink-0" /><button type="button" className="break-all rounded p-1 hover:underline" onClick={() => onSelect(crumbs.slice(0, index + 1).join(" / "))}>{crumb}</button></span>)}
          </nav><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">Файлов: {visibleFiles.length} · Папок: {children.length}</span>{selected && canManage && <ActionMenu label="Действия с папкой" actions={[{label:"Удалить папку", danger:true, onSelect:() => onDeleteFolder(selected)}]} />}</div>
        </div>
        {children.length > 0 && <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">{children.map(path => {
          const empty = !files.some(file => normalizeFolder(file.folder) === path) && !paths.some(child => child.startsWith(path + " / "));
          return <button key={path} type="button" className="touch-target flex min-w-0 items-center gap-3 rounded-lg border bg-muted/20 p-3 text-left hover:border-primary/40 hover:bg-primary/5" onClick={() => onSelect(path)}><FolderOpen className="size-6 shrink-0 text-primary" /><span className="min-w-0"><span className="folder-name block text-sm font-medium">{path.split(" / ").at(-1)}</span><span className="text-xs text-muted-foreground">{empty ? "Пусто" : "Открыть папку"}</span></span><ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" /></button>;
        })}</div>}
        {!children.length && !visibleFiles.length && <div className="flex flex-col items-center gap-3 px-4 py-12 text-center"><FolderOpen className="size-10 text-muted-foreground/60" /><h2 className="font-medium">Папка пуста</h2><p className="text-sm text-muted-foreground">Здесь пока нет файлов и вложенных папок.</p>{canManage && <div className="mt-1 flex flex-wrap justify-center gap-2">{onUpload && <Button onClick={onUpload}>Загрузить файл</Button>}{onCreate && <Button variant="secondary" onClick={onCreate}>Создать папку</Button>}</div>}</div>}
        {visibleFiles.length > 0 &&         <div className="files-table-scroll"><table className="w-full min-w-[660px] text-sm">
          <thead className="sticky top-0 z-10 bg-muted"><tr>{["Файл", "Автор", "Дата", "Комментарий", "Действия"].map(label => <th key={label} className="border-b px-4 py-2 text-left text-xs font-medium text-muted-foreground">{label}</th>)}</tr></thead>
          <tbody>{visibleFiles.map(file => <tr key={file.name} className="border-b last:border-0 hover:bg-muted/30">
            <td className="max-w-72 px-4 py-2"><div className="flex items-center gap-2"><FileIcon name={file.name} /><span className="break-all font-medium">{file.name}</span></div></td>
            <td className="px-4 py-2">{file.author}</td><td className="whitespace-nowrap px-4 py-2">{file.date}</td><td className="min-w-40 max-w-sm break-words px-4 py-2">{file.comment || "—"}</td>
            <td className="px-4 py-2"><div className="flex gap-1"><Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Скачать ${file.name}`} title={`Скачать ${file.name}`} onClick={() => onDownload(file.name)}><Download /></Button>
              {canManage && <Button variant="secondary" className="h-9 w-9 p-0 text-destructive" aria-label={`Удалить ${file.name}`} title={`Удалить ${file.name}`} onClick={() => onDelete(file.name)}><Trash2 /></Button>}</div></td>
          </tr>)}</tbody>
        </table></div>}
      </div>
    </div>
  </Card>;
}

function FolderBranch({ path, paths, files, selected, collapsed, onSelect, onToggle }: {
  path: string; paths: string[]; files: StoredFile[]; selected: string; collapsed: Set<string>; onSelect: (path: string) => void; onToggle: (path: string) => void;
}) {
  const children = paths.filter(child => child.startsWith(path + " / ") && child.slice(path.length + 3).indexOf(" / ") < 0);
  const empty = !children.length && !files.some(file => normalizeFolder(file.folder) === path);
  const open = !collapsed.has(path);
  return <li>
    <div className={`folder-tree-row flex min-w-0 items-center gap-1 rounded-md ${selected === path ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>
      {children.length ? <button type="button" className="touch-target flex size-7 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${open ? "Свернуть" : "Раскрыть"} папку ${path}`} aria-expanded={open} onClick={() => onToggle(path)}>{open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</button> : <span className="w-7 shrink-0" />}
      <button type="button" title={path} aria-label={`Открыть папку ${path}${empty ? " (пусто)" : ""}`} aria-current={selected === path ? "location" : undefined} className="touch-target flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded py-2 pr-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect(path)}><FolderOpen className="size-4 shrink-0" /><span className="folder-name min-w-0">{path.split(" / ").at(-1)}{empty && <span className="ml-2 text-xs font-normal text-muted-foreground"> Пусто</span>}</span></button>
    </div>
    {open && children.length > 0 && <ul>{children.map(child => <FolderBranch key={child} path={child} paths={paths} files={files} selected={selected} collapsed={collapsed} onSelect={onSelect} onToggle={onToggle} />)}</ul>}
  </li>;
}
