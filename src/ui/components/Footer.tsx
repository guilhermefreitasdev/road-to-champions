export function Footer() {
  return (
    <footer className="footer">
      <p className="footer-credits">
        Dados:{' '}
        <a href="https://www.vlr.gg" target="_blank" rel="noopener noreferrer">
          VLR.gg
        </a>{' '}
        (stats por evento) e{' '}
        <a href="https://liquipedia.net/valorant/" target="_blank" rel="noopener noreferrer">
          Liquipedia
        </a>{' '}
        (elencos, técnicos e IGLs,{' '}
        <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">
          CC-BY-SA 3.0
        </a>
        ). OVR e atributos são calculados a partir desses números.
      </p>
      <p>
        Road to Champions é um projeto de fã, não oficial, e não é endossado pela Riot Games. Não reflete as opiniões
        de ninguém oficialmente envolvido na produção ou gestão de propriedades da Riot Games. Riot Games e todas as
        propriedades associadas são marcas registradas da Riot Games, Inc.
      </p>
    </footer>
  );
}
