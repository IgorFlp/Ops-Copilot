import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">Página não encontrada</h1>
      <p>O caminho solicitado não existe no War Room.</p>
      <p>
        <Link to="/chat">Ir para o chat</Link>
      </p>
    </section>
  );
}
