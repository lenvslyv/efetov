import { Button, Card, Modal } from "@/shared/ui";

export function LeaderEditConfirm({
  creator,
  onCancel,
  onConfirm,
}: {
  creator: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Подтверждение редактирования" onClose={onCancel}>
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Подтверждение редактирования</h2>
        <p className="mt-3 text-slate-700">
          Вы уверены, что хотите внести изменения? Данные о пациенте были внесены
          другим пользователем – <b>{creator}</b>.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
          <Button onClick={onConfirm}>Внести исправления</Button>
        </div>
      </Card>
    </Modal>
  );
}
