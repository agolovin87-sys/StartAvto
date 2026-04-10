import { useAuth } from "@/context/AuthContext";

export function PendingApprovalScreen() {
  const { signOut } = useAuth();
  return (
    <div className="account-status-screen">
      <h1 className="account-status-title">Ожидает подтверждения</h1>
      <p className="account-status-text">
        Заявка отправлена администратору. После активации аккаунта вы получите
        доступ к кабинету.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => signOut()}>
        Выйти
      </button>
    </div>
  );
}

export function InactiveAccountScreen() {
  const { signOut } = useAuth();
  return (
    <div className="account-status-screen">
      <h1 className="account-status-title">Аккаунт деактивирован</h1>
      <p className="account-status-text">
        Доступ ограничен. По вопросам обратитесь в автошколу.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => signOut()}>
        Выйти
      </button>
    </div>
  );
}

export function RejectedAccountScreen() {
  const { signOut } = useAuth();
  return (
    <div className="account-status-screen">
      <h1 className="account-status-title">Доступ закрыт</h1>
      <p className="account-status-text">
        Учётная запись удалена администратором.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => signOut()}>
        На страницу входа
      </button>
    </div>
  );
}
