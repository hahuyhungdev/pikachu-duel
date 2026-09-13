interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  return (
    <div className="toast" data-toast hidden={!message}>
      {message}
    </div>
  );
}
