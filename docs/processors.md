# Processors and their agreements

Read this when you add, change or drop a service that handles personal data, when someone asks who processes it, or when a processor changes its terms. It is the register of the agreements that UK GDPR Article 28 requires with each processor; what each one holds is in [data-map.md](data-map.md) (gap 7, #409).

Each processor works for us under a data processing agreement (DPA). All three publish one that **binds when we accept their terms**, so there is nothing to sign, but we must be able to show which version applied and when. The controller is Jeni Tennison Consulting Ltd (ICO ZB302880).

| Processor | For                                       | Where      | Agreement                                                                                                                                                                                                         | How it applies                                                                                                                                                                                                                                              | Accepted          | Copy saved                                                                      |
| --------- | ----------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| UpCloud   | Hosting: the server, database and backups | London, UK | The DPA inside [UpCloud's Terms of Service](https://upcloud.com/global/terms-of-service/)                                                                                                                         | Incorporated into the terms, so binding once the account accepts them. UpCloud is processor for what we store on the server, but controller for our account and billing details. Sub-processors are listed in an appendix, with 30 days' notice of changes. | _Owner to record_ | [yes](https://drive.google.com/drive/folders/1kr_DgwklT4DdMxqzeMfqKuDO-bzigfBB) |
| Scaleway  | Sending email; off-site backup storage    | France     | The DPA, a PDF that is part of the contract, in the console: _Settings → Organization contracts_ ([how to download](https://www.scaleway.com/en/docs/account/support/download-scaleway-contracts/))               | Part of the contract for the services. Check the contract list for the date of the version that applies to our organisation.                                                                                                                                | _Owner to record_ | [yes](https://drive.google.com/drive/folders/1kr_DgwklT4DdMxqzeMfqKuDO-bzigfBB) |
| Gandi     | DNS; the `hello@` forwarder               | France     | [Data Processing Agreement](https://contract.gandi.net/v5/contracts/53949/DPA_2023.0_en.pdf) (version 2023.0 when checked), listed under Gandi's [contracts](https://www.gandi.net/en/contracts/terms-of-service) | Gandi says that buying a service means accepting the matching contract. Check the account's contracts page for what was accepted and when.                                                                                                                  | _Owner to record_ | [yes](https://drive.google.com/drive/folders/1kr_DgwklT4DdMxqzeMfqKuDO-bzigfBB) |

Not processors of ours, so no agreement is needed:

- **Google**, for sign-in, and the **writer's AI provider**: each is an independent controller under the person's own agreement ([data-map.md](data-map.md)).
- **GitHub** (the code, the private images at ghcr.io, the landing page): holds no account data. The landing page may log visitors' IP addresses under GitHub's own terms.

Facts above were read from the processors' public pages on 26 October 2026 and not from the signed-in accounts; UpCloud's and Scaleway's legal pages could not be read directly, so the way each agreement applies comes from search results and needs confirming in the accounts.

## What to do, once, before the first outside user

For each processor:

1. Open the agreement from the link, and download it.
2. In the account, find where the terms were accepted and note the date. Put the date, and the version if it has one, in the _Accepted_ column.
3. Save the PDF where the owner keeps company records, outside this repository (they are the suppliers' documents, and a version changes without us). Set _Copy saved_ to yes. The copies are in one Google Drive folder, linked in the table (saved 26 October 2026); put a new version in the same folder, with its date in the file name.
4. Read the sub-processor list, and check each one is somewhere the privacy notice (#321) can honestly describe.
5. Check that the agreement covers the **UK**: for an EU processor, the UK's adequacy regulations cover transfers to France, so a plain EU DPA is enough; note it if one asks for the UK addendum.

## When it changes

A processor must tell us before it changes sub-processors or terms (UpCloud: 30 days). Read the notice, update the row, and if we object and cannot live with it, plan the move: every service is behind an adapter or a setting ([ports and adapters](adr/foundations/ports-and-adapters-for-every-external-service.md)), and a change of provider is a change to the data map, this register and the privacy notice in the same commit.
