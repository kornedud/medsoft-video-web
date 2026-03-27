const LOGIN_RE = /^[a-zA-Z0-9_]{3,16}$/;
const PASSWORD_SPECIALS = new Set([..."!@#$%^&*()_-+="]);

export function validateLogin(login) {
  if (!LOGIN_RE.test(login)) {
    return "Логин: 3–16 символов, только латинские буквы, цифры и подчёркивание.";
  }
  return null;
}

export function validatePassword(password) {
  if (password.length < 10 || password.length > 16) {
    return "Пароль: от 10 до 16 символов.";
  }
  if (!/[a-z]/.test(password)) {
    return "Пароль: нужна хотя бы одна строчная буква.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Пароль: нужна хотя бы одна заглавная буква.";
  }
  if (!/\d/.test(password)) {
    return "Пароль: нужна хотя бы одна цифра.";
  }
  if (![...password].some((c) => PASSWORD_SPECIALS.has(c))) {
    return "Пароль: нужен хотя бы один спецсимвол из набора !@#$%^&*()_-+=";
  }
  return null;
}
