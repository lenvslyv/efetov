export function passwordError(password: string, repeat: string): string {
  const errors: string[] = [];
  if ([...password].length < 8) errors.push("не менее 8 символов");
  if ((password.match(/\p{L}/gu) ?? []).length < 2) errors.push("не менее 2 букв");
  if ((password.match(/[0-9]/g) ?? []).length < 2) errors.push("не менее 2 цифр");
  if (errors.length) return `Пароль должен содержать: ${errors.join("; ")}`;
  return password === repeat ? "" : "Пароли не совпадают";
}
